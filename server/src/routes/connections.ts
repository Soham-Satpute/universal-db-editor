import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import { join } from "path";
import { z } from "zod";

import { encrypt, decrypt } from "../utils/encryption";
import {
  readConnections,
  writeConnections,
  findById,
  StoredConnection,
} from "../utils/connectionStore";
import { getProvider, activeProviders } from "../providers/ProviderRegistry";
import { ConnectionConfig, DbType } from "../types";

const router = Router();

// ---------------------------------------------------------------------------
// Multer — SQLite file uploads land in server/uploads/
// ---------------------------------------------------------------------------
const upload = multer({
  dest: join(__dirname, "../../uploads/"),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter(_req, file, cb) {
    if (/\.(sqlite3?|db)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Only SQLite database files are accepted"));
    }
  },
});

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------
const BaseConnectionSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  isFavorite: z.boolean().optional().default(false),
});

const SQLiteConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal("sqlite"),
  filePath: z.string().optional(),
});

const PostgreSQLConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal("postgresql"),
  host: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  database: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  connectionString: z.string().optional(),
});

const MongoConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal("mongodb"),
  uri: z.string().optional(),
});

const ConnectionSchema = z.discriminatedUnion("type", [
  SQLiteConnectionSchema,
  PostgreSQLConnectionSchema,
  MongoConnectionSchema,
]);

type ConnectionInput = z.infer<typeof ConnectionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitize(conn: StoredConnection): object {
  let config: ConnectionConfig = { type: conn.type };
  try {
    config = JSON.parse(decrypt(conn.encryptedConfig)) as ConnectionConfig;
  } catch {
    // key rotation or corruption — return minimal safe config
  }

  // Strip all sensitive fields before returning to client
  const safeConfig: Record<string, unknown> = { type: config.type };
  if (config.type === "sqlite") safeConfig.filePath = config.filePath;
  if (config.type === "postgresql") {
    safeConfig.host = config.host;
    safeConfig.port = config.port;
    safeConfig.database = config.database;
    safeConfig.user = config.user;
    // password intentionally omitted
  }
  // mongodb uri intentionally omitted

  const { encryptedConfig: _enc, ...rest } = conn;
  return { ...rest, config: safeConfig };
}

function buildConfig(input: ConnectionInput, filePath?: string): ConnectionConfig {
  if (input.type === "sqlite") {
    return { type: "sqlite", filePath: filePath ?? input.filePath };
  }
  if (input.type === "postgresql") {
    return {
      type: "postgresql",
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.user,
      password: input.password,
      connectionString: input.connectionString,
    };
  }
  return { type: "mongodb", uri: input.uri };
}

// ---------------------------------------------------------------------------
// GET /api/connections
// ---------------------------------------------------------------------------
router.get("/", (_req: Request, res: Response) => {
  const connections = readConnections();
  const sanitized = connections.map(sanitize);
  // Favorites first, then alphabetical
  sanitized.sort((a: any, b: any) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  res.json({ ok: true, connections: sanitized });
});

// ---------------------------------------------------------------------------
// POST /api/connections
// ---------------------------------------------------------------------------
router.post("/", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  let body: unknown = req.body;
  // FormData sends all values as strings — coerce the typed fields before Zod sees them.
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    if ("port" in b) b.port = Number(b.port);
    if ("isFavorite" in b) b.isFavorite = b.isFavorite === "true" || b.isFavorite === true;
  }

  const parsed = ConnectionSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const input = parsed.data;
  const uploadedFilePath = req.file?.path;

  if (input.type === "sqlite" && !uploadedFilePath && !input.filePath) {
    res.status(400).json({ ok: false, error: "SQLite requires a file upload or filePath" });
    return;
  }
  if (input.type === "mongodb" && !input.uri) {
    res.status(400).json({ ok: false, error: "MongoDB URI is required" });
    return;
  }

  const config = buildConfig(input, uploadedFilePath);
  const now = new Date().toISOString();
  const newConn: StoredConnection = {
    id: randomUUID(),
    name: input.name,
    type: input.type as DbType,
    encryptedConfig: encrypt(JSON.stringify(config)),
    isFavorite: input.isFavorite ?? false,
    createdAt: now,
    updatedAt: now,
  };

  const connections = readConnections();
  connections.push(newConn);
  writeConnections(connections);

  res.status(201).json({ ok: true, connection: sanitize(newConn) });
});

// ---------------------------------------------------------------------------
// PUT /api/connections/:id
// ---------------------------------------------------------------------------
router.put("/:id", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const existing = findById(req.params.id);
  if (!existing) {
    res.status(404).json({ ok: false, error: "Connection not found" });
    return;
  }

  let body: unknown = req.body;
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    if ("port" in b) b.port = Number(b.port);
    if ("isFavorite" in b) b.isFavorite = b.isFavorite === "true" || b.isFavorite === true;
  }

  const parsed = ConnectionSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const input = parsed.data;
  const uploadedFilePath = req.file?.path;

  // Preserve existing sensitive fields if not re-supplied
  let existingConfig: ConnectionConfig = { type: existing.type };
  try {
    existingConfig = JSON.parse(decrypt(existing.encryptedConfig)) as ConnectionConfig;
  } catch { /* ignore */ }

  const newConfig: ConnectionConfig = { ...existingConfig, ...buildConfig(input, uploadedFilePath) };

  // Keep old password/uri if not re-entered
  if (input.type === "postgresql" && !(input as any).password) {
    (newConfig as any).password = (existingConfig as any).password;
  }
  if (input.type === "mongodb" && !(input as any).uri) {
    (newConfig as any).uri = (existingConfig as any).uri;
  }

  const connections = readConnections();
  const idx = connections.findIndex((c) => c.id === req.params.id);
  connections[idx] = {
    ...existing,
    name: input.name,
    type: input.type as DbType,
    encryptedConfig: encrypt(JSON.stringify(newConfig)),
    isFavorite: input.isFavorite ?? existing.isFavorite,
    updatedAt: new Date().toISOString(),
  };
  writeConnections(connections);

  activeProviders.delete(req.params.id);

  res.json({ ok: true, connection: sanitize(connections[idx]) });
});

// ---------------------------------------------------------------------------
// DELETE /api/connections/:id
// ---------------------------------------------------------------------------
router.delete("/:id", (req: Request, res: Response) => {
  const connections = readConnections();
  const idx = connections.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ ok: false, error: "Connection not found" });
    return;
  }

  connections.splice(idx, 1);
  writeConnections(connections);

  const provider = activeProviders.get(req.params.id);
  if (provider) {
    provider.disconnect().catch(() => undefined);
    activeProviders.delete(req.params.id);
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/connections/:id/test
// ---------------------------------------------------------------------------
router.post("/:id/test", async (req: Request, res: Response): Promise<void> => {
  const stored = findById(req.params.id);
  if (!stored) {
    res.status(404).json({ ok: false, error: "Connection not found" });
    return;
  }

  let config: ConnectionConfig;
  try {
    config = JSON.parse(decrypt(stored.encryptedConfig)) as ConnectionConfig;
  } catch {
    res.status(500).json({ ok: false, error: "Failed to decrypt connection config" });
    return;
  }

  const provider = getProvider(stored.type);
  try {
    await provider.connect(config);
    await provider.disconnect();
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/connections/:id/favorite
// ---------------------------------------------------------------------------
router.patch("/:id/favorite", (req: Request, res: Response) => {
  const connections = readConnections();
  const idx = connections.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ ok: false, error: "Connection not found" });
    return;
  }
  connections[idx].isFavorite = !connections[idx].isFavorite;
  connections[idx].updatedAt = new Date().toISOString();
  writeConnections(connections);
  res.json({ ok: true, isFavorite: connections[idx].isFavorite });
});

export default router;