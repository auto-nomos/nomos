/**
 * Linear's API is GraphQL-only — every action POSTs to a single endpoint
 * (`/` after stripping the `/graphql` api_base). So the URL parser is
 * trivial; the real work happens in extract.ts against `body`.
 *
 * Returns null for any path other than `/` since a linear constraint must
 * never apply to a non-GraphQL call.
 */
export function parseLinearPath(path: string): { ok: true } | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  if (head !== '/' && head !== '') return null;
  return { ok: true };
}

const OP_NAME_RE = /^\s*(?:query|mutation|subscription)\s+(?:[A-Za-z_][A-Za-z0-9_]*)?/m;

/**
 * Extract operation name + variable bag from a GraphQL request body. The
 * caller passes `body.query` (the raw GQL document) and `body.variables`
 * (the JSON variable bag) — both surface ids the validator compares
 * against the agent's `LinearConstraint`.
 */
export function parseLinearBody(body: unknown): {
  operation?: string;
  variables?: Record<string, unknown>;
  raw_query: string;
} | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const query = typeof b.query === 'string' ? b.query : undefined;
  if (!query) return null;
  const opMatch = query.match(/\b(query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  const op = opMatch ? opMatch[2] : undefined;
  const variables =
    b.variables && typeof b.variables === 'object' && !Array.isArray(b.variables)
      ? (b.variables as Record<string, unknown>)
      : undefined;
  return { operation: op, variables, raw_query: query };
}

export function isMutationQuery(rawQuery: string): boolean {
  // First non-whitespace operation keyword. Tolerates leading comments.
  const cleaned = rawQuery.replace(/(^|\n)\s*#[^\n]*/g, '').trimStart();
  return cleaned.startsWith('mutation');
}

export { OP_NAME_RE };
