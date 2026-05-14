/**
 * Parse notion API paths. api_base is `https://api.notion.com/v1`, so paths
 * that arrive lack the `/v1` prefix: `/pages/{id}`, `/databases/{id}`,
 * `/databases/{id}/query`, `/blocks/{id}`, `/blocks/{id}/children`,
 * `/users`, `/users/{id}`, `/search`, `/comments`.
 *
 * UUID hyphens are stripped before equality elsewhere — this parser
 * preserves the raw id so the validator can normalise both sides.
 */
export function parseNotionPath(path: string): {
  namespace?: 'pages' | 'databases' | 'blocks' | 'users' | 'comments' | 'search';
  page_id?: string;
  database_id?: string;
  block_id?: string;
  user_id?: string;
  action?: 'query' | 'children';
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  const ns = segs[0];
  switch (ns) {
    case 'pages': {
      const out: ReturnType<typeof parseNotionPath> = { namespace: 'pages' };
      if (segs[1]) out!.page_id = segs[1];
      return out;
    }
    case 'databases': {
      const out: ReturnType<typeof parseNotionPath> = { namespace: 'databases' };
      if (segs[1]) out!.database_id = segs[1];
      if (segs[2] === 'query') out!.action = 'query';
      return out;
    }
    case 'blocks': {
      const out: ReturnType<typeof parseNotionPath> = { namespace: 'blocks' };
      if (segs[1]) out!.block_id = segs[1];
      if (segs[2] === 'children') out!.action = 'children';
      return out;
    }
    case 'users': {
      const out: ReturnType<typeof parseNotionPath> = { namespace: 'users' };
      if (segs[1]) out!.user_id = segs[1];
      return out;
    }
    case 'comments':
      return { namespace: 'comments' };
    case 'search':
      return { namespace: 'search' };
    default:
      return null;
  }
}

/** Strip dashes for UUID comparison — notion accepts both 32-char and 36-char ids. */
export function normaliseNotionId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}
