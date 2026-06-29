import { Request, Response, NextFunction } from "express";

/**
 * Day 6 — expanded queryGuard with the full pattern list from the plan.
 *
 * Blocked patterns:
 *  - DROP DATABASE / TABLE / INDEX / SCHEMA
 *  - TRUNCATE [TABLE]
 *  - DELETE FROM <table>  **without** a WHERE clause
 *  - ALTER TABLE … DROP COLUMN
 *
 * When blocked the route returns:
 *   HTTP 403  { error: string, requiresConfirmation: true }
 *
 * Frontend should intercept requiresConfirmation and show a "Type CONFIRM"
 * modal, then re-submit with { confirmed: true } in the body.
 * If confirmed is true the guard lets the request through regardless.
 */

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /DROP\s+(DATABASE|TABLE|INDEX|SCHEMA)/i,
    message: "DROP statements are not allowed",
  },
  {
    pattern: /TRUNCATE(\s+TABLE)?/i,
    message: "TRUNCATE is not allowed",
  },
  {
    // DELETE FROM <table> not followed by WHERE anywhere on the same line/query.
    // The negative lookahead (?![\s\S]*\bWHERE\b) checks the rest of the string.
    pattern: /DELETE\s+FROM\s+\w+\s*(?![\s\S]*\bWHERE\b)/i,
    message: "DELETE without WHERE clause is not allowed",
  },
  {
    pattern: /ALTER\s+TABLE.+DROP\s+COLUMN/i,
    message: "ALTER TABLE … DROP COLUMN is not allowed",
  },
];

export function queryGuard(req: Request, res: Response, next: NextFunction): void {
  // Allow if the client has already confirmed the dangerous operation
  if (req.body?.confirmed === true) {
    next();
    return;
  }

  // Queries can arrive in req.body.query (SQL) or req.body.filter (Mongo)
  const queryText: string =
    (req.body?.query as string) ?? (req.body?.filter as string) ?? "";

  const blocked = DANGEROUS_PATTERNS.find(({ pattern }) => pattern.test(queryText));

  if (blocked) {
    res.status(403).json({
      error: blocked.message,
      requiresConfirmation: true,
    });
    return;
  }

  next();
}
