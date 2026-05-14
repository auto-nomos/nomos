import { parseGoogleContactsPath } from './path.js';

export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string },
): Record<string, unknown> | null {
  const parsed = parseGoogleContactsPath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.resource_name) out.resource_name = parsed.resource_name;
  return Object.keys(out).length === 0 ? null : out;
}
