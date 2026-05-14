/** Browser-safe extname: returns "ts" for "foo.ts", "" for "foo". */
function extname(p: string): string {
  const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  const dot = p.lastIndexOf('.');
  return dot > slash && dot < p.length - 1 ? p.slice(dot + 1) : '';
}

export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string; body?: unknown; query?: Record<string, string> },
): Record<string, unknown> | null {
  const filePath =
    (apiCall.query?.path as string | undefined) ||
    ((apiCall.body as Record<string, unknown> | undefined)?.path as string | undefined);

  if (!filePath) return null;

  const out: Record<string, unknown> = { path: filePath };
  const ext = extname(filePath);
  if (ext) out.extension = ext;
  return out;
}
