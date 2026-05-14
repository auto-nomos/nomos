import { parseGoogleDocsPath } from './path.js';

export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string },
): Record<string, unknown> | null {
  const parsed = parseGoogleDocsPath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.document_id) out.document_id = parsed.document_id;
  return Object.keys(out).length === 0 ? null : out;
}
