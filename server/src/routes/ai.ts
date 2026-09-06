import { Router, Request, Response } from "express";
import { decrypt } from "../utils/encryption";
import { findById } from "../utils/connectionStore";
import { activeProviders, getProvider } from "../providers/ProviderRegistry";
import { ConnectionConfig, DatabaseProvider } from "../types";

const router = Router();

// Groq exposes an OpenAI-compatible /chat/completions endpoint, so this is
// just a plain fetch — no SDK needed. Model + endpoint are overridable via
// env in case Groq deprecates a model or the user wants a cheaper/faster one.
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// ---------------------------------------------------------------------------
// Helper: get (or lazily connect) a provider — same pattern as the other
// route files (query.ts, export.ts, explorer.ts).
// ---------------------------------------------------------------------------
async function getConnectedProvider(connId: string): Promise<{
  provider: DatabaseProvider;
  type: string;
}> {
  const existing = activeProviders.get(connId);
  const stored = findById(connId);
  if (!stored) throw Object.assign(new Error("Connection not found"), { status: 404 });

  if (existing) return { provider: existing, type: stored.type };

  let config: ConnectionConfig;
  try {
    config = JSON.parse(decrypt(stored.encryptedConfig)) as ConnectionConfig;
  } catch {
    throw Object.assign(new Error("Failed to decrypt connection config"), { status: 500 });
  }

  const provider = getProvider(stored.type);
  await provider.connect(config);
  activeProviders.set(connId, provider);
  return { provider, type: stored.type };
}

function sendError(res: Response, error: unknown): void {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 500;
  const message = error instanceof Error ? error.message : String(error);
  res.status(Number.isFinite(status) ? status : 500).json({ ok: false, error: message });
}

function dialectLabel(dbType: string): string {
  if (dbType === "mongodb") return "MongoDB shell syntax (e.g. db.collection.find({...}))";
  if (dbType === "sqlite") return "SQLite SQL";
  return "PostgreSQL SQL";
}

/**
 * Builds a compact text block describing the database schema, to ground the
 * model's suggestions. Kept cheap: always includes the table list; only
 * pulls full column detail for a focused table (if given) plus up to 4 more,
 * so the prompt stays small even on wide databases.
 */
async function buildSchemaContext(provider: DatabaseProvider, focusTable?: string): Promise<string> {
  let tables: string[] = [];
  try {
    tables = await provider.listTables();
  } catch {
    return "(schema unavailable)";
  }

  const lines: string[] = [`Tables: ${tables.join(", ") || "(none)"}`];

  const detailTables = [
    ...(focusTable && tables.includes(focusTable) ? [focusTable] : []),
    ...tables.filter((t) => t !== focusTable),
  ].slice(0, 5);

  for (const table of detailTables) {
    try {
      const schema = await provider.getSchema(table);
      const cols = schema.columns
        .map((c) => `${c.name} ${c.type}${c.isPrimaryKey ? " PK" : ""}`)
        .join(", ");
      lines.push(`- ${table}(${cols})`);
    } catch {
      // Skip tables whose schema can't be read — not fatal to the request.
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Groq chat completion helper. Deliberately untyped as `Response` isn't
// annotated (Express's Response is imported under the same name above) —
// TS infers the global fetch Response type fine without the annotation.
// ---------------------------------------------------------------------------
async function callGroq(
  messages: Array<{ role: "system" | "user"; content: string }>,
  maxTokens = 500,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error(
        "GROQ_API_KEY is not configured on the server. Add it to server/.env to enable the AI assistant.",
      ),
      { status: 500 },
    );
  }

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    throw Object.assign(
      new Error(`Could not reach Groq API: ${err instanceof Error ? err.message : String(err)}`),
      { status: 502 },
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw Object.assign(
      new Error(`Groq API error (${response.status}): ${text || response.statusText}`),
      { status: 502 },
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw Object.assign(new Error("Groq API returned an empty response"), { status: 502 });
  }
  return content;
}

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/:connId/autocomplete
// Body: { query: string, table?: string }
// ---------------------------------------------------------------------------
router.post("/:connId/autocomplete", async (req: Request, res: Response): Promise<void> => {
  const { connId } = req.params;
  const query: string = (req.body?.query as string) ?? "";
  const table: string | undefined = req.body?.table;

  if (!query.trim()) {
    res.status(400).json({ ok: false, error: "query is required" });
    return;
  }

  try {
    const { provider, type } = await getConnectedProvider(connId);
    const schemaContext = await buildSchemaContext(provider, table);

    const content = await callGroq(
      [
        {
          role: "system",
          content:
            `You are an autocomplete assistant embedded in a database query editor. ` +
            `The database dialect is ${dialectLabel(type)}. ` +
            `Given the schema and the query text typed so far, suggest ONLY the text that should ` +
            `be appended to continue or complete the query sensibly. Never repeat text that's ` +
            `already present. Keep it short — a clause, condition, or a few columns, not a full ` +
            `essay. If there's nothing sensible to add, return an empty suggestion. ` +
            `Respond with strict JSON only, no markdown fences: {"suggestion": string}`,
        },
        {
          role: "user",
          content: `Schema:\n${schemaContext}\n\nQuery so far:\n${query}`,
        },
      ],
      200,
    );

    const parsed = safeJsonParse<{ suggestion?: string }>(content, {});
    res.json({ ok: true, suggestion: parsed.suggestion ?? "" });
  } catch (err) {
    sendError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/:connId/explain
// Body: { query: string, table?: string }
// ---------------------------------------------------------------------------
router.post("/:connId/explain", async (req: Request, res: Response): Promise<void> => {
  const { connId } = req.params;
  const query: string = (req.body?.query as string) ?? "";
  const table: string | undefined = req.body?.table;

  if (!query.trim()) {
    res.status(400).json({ ok: false, error: "query is required" });
    return;
  }

  try {
    const { provider, type } = await getConnectedProvider(connId);
    const schemaContext = await buildSchemaContext(provider, table);

    const content = await callGroq(
      [
        {
          role: "system",
          content:
            `You explain ${dialectLabel(type)} queries in plain English for someone reading a ` +
            `database GUI. Be concise and concrete: what data it reads or writes, which tables and ` +
            `columns are involved, and any filtering, sorting, joins, or aggregation. Use short ` +
            `plain-text sentences or "-" bullet points — no markdown headers. ` +
            `Respond with strict JSON only, no markdown fences: {"explanation": string}`,
        },
        {
          role: "user",
          content: `Schema:\n${schemaContext}\n\nQuery:\n${query}`,
        },
      ],
      400,
    );

    const parsed = safeJsonParse<{ explanation?: string }>(content, {});
    res.json({ ok: true, explanation: parsed.explanation ?? "" });
  } catch (err) {
    sendError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/:connId/fix
// Body: { query: string, error: string, table?: string }
// ---------------------------------------------------------------------------
router.post("/:connId/fix", async (req: Request, res: Response): Promise<void> => {
  const { connId } = req.params;
  const query: string = (req.body?.query as string) ?? "";
  const errorMessage: string = (req.body?.error as string) ?? "";
  const table: string | undefined = req.body?.table;

  if (!query.trim()) {
    res.status(400).json({ ok: false, error: "query is required" });
    return;
  }

  try {
    const { provider, type } = await getConnectedProvider(connId);
    const schemaContext = await buildSchemaContext(provider, table);

    const content = await callGroq(
      [
        {
          role: "system",
          content:
            `You fix broken ${dialectLabel(type)} queries for a database GUI. Given the failing ` +
            `query, the error message it produced, and the schema, return a corrected query plus a ` +
            `one- or two-sentence explanation of what was wrong. Preserve the query's original ` +
            `intent — don't change what it's trying to do, just fix it. ` +
            `Respond with strict JSON only, no markdown fences: ` +
            `{"fixedQuery": string, "explanation": string}`,
        },
        {
          role: "user",
          content:
            `Schema:\n${schemaContext}\n\nFailing query:\n${query}\n\n` +
            `Error:\n${errorMessage || "(not provided)"}`,
        },
      ],
      500,
    );

    const parsed = safeJsonParse<{ fixedQuery?: string; explanation?: string }>(content, {});
    res.json({
      ok: true,
      fixedQuery: parsed.fixedQuery ?? "",
      explanation: parsed.explanation ?? "",
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
