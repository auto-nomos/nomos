/**
 * Google Docs paths (api_base `https://docs.googleapis.com/v1`):
 *   /documents
 *   /documents/{documentId}
 *   /documents/{documentId}:batchUpdate
 *
 * Note the unusual `{documentId}:verb` segment style.
 */
export function parseGoogleDocsPath(path: string): {
  document_id?: string;
  action?: 'batchUpdate';
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  if (segs[0] !== 'documents') return null;
  if (!segs[1]) return {};
  const last = segs[1];
  const colonIdx = last.indexOf(':');
  if (colonIdx === -1) return { document_id: last };
  const id = last.slice(0, colonIdx);
  const verb = last.slice(colonIdx + 1);
  const out: ReturnType<typeof parseGoogleDocsPath> = { document_id: id };
  if (verb === 'batchUpdate') out!.action = 'batchUpdate';
  return out;
}
