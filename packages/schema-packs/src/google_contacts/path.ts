/**
 * Google People API paths (api_base `https://people.googleapis.com/v1`):
 *   /people/me/connections
 *   /people:searchContacts
 *   /people/{resourceName}    where resourceName is e.g. `people/c123…`
 *                             — URL-encoded so the leading `people/` is `%2Fpeople%2Fc…`.
 *                             We split on `/` and treat the trailing path
 *                             as the encoded resource_name.
 */
export function parseGoogleContactsPath(path: string): {
  resource_name?: string;
  namespace?: 'connections' | 'search' | 'person';
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  if (head === '/people:searchContacts') return { namespace: 'search' };
  if (head === '/people/me/connections') return { namespace: 'connections' };
  // /{resourceName} where the substituted value is `people/c12345` (the
  // leading `/` is part of substitutePath's output; api_base already
  // carries the `/v1` so this `people/...` chunk is the resource_name).
  const segs = head.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  if (segs[0] !== 'people') return null;
  return { namespace: 'person', resource_name: segs.join('/') };
}
