import { Router, Request, Response } from "express";
import { createReadStream } from "fs";
import { unlink } from "fs/promises";
import multer from "multer";
import { join } from "path";
import { decrypt } from "../utils/encryption";
import { findById } from "../utils/connectionStore";
import { activeProviders, getProvider } from "../providers/ProviderRegistry";
import { ConnectionConfig, DatabaseProvider } from "../types";

const router = Router();

// ---------------------------------------------------------------------------
// Multer — temp files land in server/uploads/ and are deleted after import
// ---------------------------------------------------------------------------
const upload = multer({
  dest: join(__dirname, "../../uploads/"),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter(_req, file, cb) {
    if (/\.(csv|json)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Only .csv and .json files are accepted"));
    }
  },
});

// ---------------------------------------------------------------------------
// Helper: get (or lazily connect) a provider
// ---------------------------------------------------------------------------
async function getConnectedProvider(connId: string): Promise<{
  provider: DatabaseProvider;
}> {
  const existing = activeProviders.get(connId);
  const stored = findById(connId);
  if (!stored) throw Object.assign(new Error("Connection not found"), { status: 404 });

  if (existing) return { provider: existing };

  let config: ConnectionConfig;
  try {
    config = JSON.parse(decrypt(stored.encryptedConfig)) as ConnectionConfig;
  } catch {
    throw Object.assign(new Error("Failed to decrypt connection config"), { status: 500 });
  }

  const provider = getProvider(stored.type);
  await provider.connect(config);
  activeProviders.set(connId, provider);
  return { provider };
}

// ---------------------------------------------------------------------------
// Minimal CSV parser — handles quoted fields with embedded commas/newlines
// ---------------------------------------------------------------------------
function parseCsv(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.trim()) lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return [];

  function splitRow(line: string): string[] {
    const fields: string[] = [];
    let field = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { field += '"'; i++; }
        else q = !q;
      } else if (ch === "," && !q) {
        fields.push(field);
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  }

  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Read a file from disk as a string
// ---------------------------------------------------------------------------
async function readFileText(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    createReadStream(filePath)
      .on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      .on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
      .on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// POST /api/import/:connId/:table
// Body: multipart/form-data with a single file field named "file"
// ---------------------------------------------------------------------------
router.post(
  "/:connId/:table",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const { connId, table } = req.params;

    if (!req.file) {
      res.status(400).json({ ok: false, error: "No file uploaded. Send a .csv or .json file in the 'file' field." });
      return;
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname.toLowerCase();

    let provider: DatabaseProvider;
    try {
      ({ provider } = await getConnectedProvider(connId));
    } catch (err) {
      await unlink(filePath).catch(() => undefined);
      const msg = err instanceof Error ? err.message : String(err);
      const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : 500;
      res.status(status).json({ ok: false, error: msg });
      return;
    }

    let records: Record<string, unknown>[] = [];

    try {
      const text = await readFileText(filePath);

      if (originalName.endsWith(".json")) {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          res.status(400).json({ ok: false, error: "JSON file must contain an array of objects" });
          return;
        }
        records = parsed as Record<string, unknown>[];
      } else {
        // CSV
        records = parseCsv(text);
        if (records.length === 0) {
          res.status(400).json({ ok: false, error: "CSV file is empty or has no data rows" });
          return;
        }
      }
    } catch (err) {
      await unlink(filePath).catch(() => undefined);
      res.status(400).json({ ok: false, error: `Failed to parse file: ${err instanceof Error ? err.message : String(err)}` });
      return;
    } finally {
      await unlink(filePath).catch(() => undefined);
    }

    if (records.length === 0) {
      res.status(400).json({ ok: false, error: "File contains no records to import" });
      return;
    }

    // Bulk insert — collect per-row errors but keep going
    let inserted = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (typeof record !== "object" || record === null || Array.isArray(record)) {
        errors.push({ row: i + 1, error: "Row is not an object" });
        continue;
      }

      // Strip empty-string values so they don't clobber nullable columns
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(record)) {
        if (v !== "" && v !== undefined) clean[k] = v;
      }

      if (Object.keys(clean).length === 0) continue; // skip blank rows

      try {
        await provider.insertRecord(table, clean);
        inserted++;
      } catch (err) {
        errors.push({ row: i + 1, error: err instanceof Error ? err.message : String(err) });
      }
    }

    res.json({
      ok: true,
      inserted,
      failed: errors.length,
      errors: errors.slice(0, 20), // cap error list in response
    });
  },
);

export default router;
