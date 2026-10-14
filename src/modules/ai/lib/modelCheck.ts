// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

export type LocalModelCheck =
  | { kind: "ok" }
  /** Server answered but its /models list could not be read; reachability only. */
  | { kind: "reachable" }
  | { kind: "model-missing"; available: string[] }
  | { kind: "http-error"; status: number }
  | { kind: "unreachable"; message: string };

/**
 * Settings → Models "Test": confirm the server answers AND that the configured
 * model id is one it serves, via the OpenAI-compatible `GET {base}/models`.
 * Reachability alone said "Reachable" for a server that would 404 every chat.
 */
export async function checkLocalModel(
  baseURL: string,
  modelId: string,
  fetchImpl: typeof fetch,
  apiKey?: string | null,
): Promise<LocalModelCheck> {
  const url = `${baseURL.trim().replace(/\/+$/, "")}/models`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
  } catch (e) {
    return {
      kind: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
  if (!res.ok) return { kind: "http-error", status: res.status };
  const wanted = modelId.trim();
  if (!wanted) return { kind: "reachable" };
  let ids: string[];
  try {
    const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
    if (!Array.isArray(body?.data)) return { kind: "reachable" };
    ids = body.data
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === "string");
  } catch {
    return { kind: "reachable" };
  }
  if (ids.includes(wanted)) return { kind: "ok" };
  return { kind: "model-missing", available: ids };
}
