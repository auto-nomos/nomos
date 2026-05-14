/**
 * Parse a Google Drive API path. api_base is `https://www.googleapis.com/drive/v3`,
 * so paths arriving at the proxy strip the `/drive/v3` prefix:
 *   /files
 *   /files/{fileId}
 *   /files/{fileId}/copy
 *   /files/{fileId}/permissions
 *   /files/{fileId}/permissions/{permissionId}
 *   /files/{fileId}/revisions
 *   /files/{fileId}/export
 *   /about
 *
 * Returns null when the leading segment isn't a recognised drive namespace
 * — the PDP refuses the call when a google_drive constraint is in effect.
 */
export function parseGoogleDrivePath(path: string): {
  namespace?: 'files' | 'about';
  file_id?: string;
  permission_id?: string;
  action?: 'copy' | 'export' | 'permissions' | 'revisions';
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  const ns = segs[0];
  if (ns === 'about') return { namespace: 'about' };
  if (ns !== 'files') return null;
  const out: ReturnType<typeof parseGoogleDrivePath> = { namespace: 'files' };
  if (segs[1]) out!.file_id = segs[1];
  if (segs[2] === 'copy') out!.action = 'copy';
  else if (segs[2] === 'export') out!.action = 'export';
  else if (segs[2] === 'revisions') out!.action = 'revisions';
  else if (segs[2] === 'permissions') {
    out!.action = 'permissions';
    if (segs[3]) out!.permission_id = segs[3];
  }
  return out;
}
