import { api } from "./client";

export interface AiFixResult {
  fixedQuery: string;
  explanation: string;
}

/**
 * Asks the AI assistant to suggest text to append to the query currently
 * in the editor. Returns an empty string when it has nothing useful to add.
 */
export async function aiAutocomplete(
  connectionId: string,
  query: string,
  table?: string | null,
): Promise<string> {
  const { data } = await api.post(`/ai/${connectionId}/autocomplete`, {
    query,
    ...(table ? { table } : {}),
  });
  return data.suggestion ?? "";
}

/** Asks the AI assistant for a plain-English explanation of the query. */
export async function aiExplain(
  connectionId: string,
  query: string,
  table?: string | null,
): Promise<string> {
  const { data } = await api.post(`/ai/${connectionId}/explain`, {
    query,
    ...(table ? { table } : {}),
  });
  return data.explanation ?? "";
}

/** Asks the AI assistant to fix a query that just failed with `error`. */
export async function aiFix(
  connectionId: string,
  query: string,
  error: string,
  table?: string | null,
): Promise<AiFixResult> {
  const { data } = await api.post(`/ai/${connectionId}/fix`, {
    query,
    error,
    ...(table ? { table } : {}),
  });
  return {
    fixedQuery: data.fixedQuery ?? "",
    explanation: data.explanation ?? "",
  };
}
