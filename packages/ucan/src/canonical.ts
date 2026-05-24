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
    // Audit M11 (2026-05-24): NFC-normalize keys before sorting so that
    // input objects whose keys arrived as NFD (decomposed) sort identically
    // to their NFC twin and produce the same canonical bytes. Today's
    // schemas are ASCII so this is latent, but any future user-supplied
    // meta key (org name, agent name, etc.) opens a divergence between
    // signer and verifier if engines normalize differently. Also de-dup:
    // if two distinct input keys normalize to the same string, keep the
    // first to make the result deterministic.
    const seen = new Set<string>();
    const pairs: Array<{ normalized: string; original: string }> = [];
    for (const original of Object.keys(obj)) {
      if (obj[original] === undefined) continue;
      const normalized = original.normalize('NFC');
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      pairs.push({ normalized, original });
    }
    pairs.sort((a, b) => (a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0));
    return `{${pairs.map((p) => `${JSON.stringify(p.normalized)}:${canonicalize(obj[p.original])}`).join(',')}}`;
  }
  throw new Error(`cannot canonicalize value of type ${typeof value}`);
}
