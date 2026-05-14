export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string; body?: unknown; query?: Record<string, string> },
): Record<string, unknown> | null {
  const q = apiCall.query ?? {};
  const b = (apiCall.body as Record<string, unknown> | undefined) ?? {};
  const host = (q.host as string | undefined) || (b.host as string | undefined);
  const filePath = (q.path as string | undefined) || (b.path as string | undefined);

  if (!host && !filePath) return null;

  const out: Record<string, unknown> = {};
  if (host) out.host = host;
  if (filePath) out.path = filePath;
  return out;
}
