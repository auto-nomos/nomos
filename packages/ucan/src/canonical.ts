/**
 * Deterministic JSON serialization for cryptographic signing.
 * Keys sorted lexicographically. Arrays preserve order. Numbers use JSON.stringify defaults.
 *
 * Why: signatures over JSON must be stable across JS engines/runtimes. Default
 * JSON.stringify preserves insertion order, which is fragile for crypto.
 */
export function canonicalize(value: unknown): string {
  if (value === undefined) {
    throw new Error('cannot canonicalize undefined');
  }
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('cannot canonicalize non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
  }
  throw new Error(`cannot canonicalize value of type ${typeof value}`);
}
