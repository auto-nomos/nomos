import type { SanitizeRule } from './schema.js';

const REDACTED = '[REDACTED]';

function applyRule(node: unknown, segments: string[], rule: SanitizeRule): void {
  if (segments.length === 0) return;
  const seg = segments[0]!;
  const rest = segments.slice(1);

  // arrays: '<key>[]' descends into each element
  if (seg.endsWith('[]')) {
    const key = seg.slice(0, -2);
    if (key === '') {
      if (Array.isArray(node)) {
        for (const item of node) applyRule(item, rest, rule);
      }
      return;
    }
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const arr = (node as Record<string, unknown>)[key];
      if (Array.isArray(arr)) {
        for (const item of arr) applyRule(item, rest, rule);
      }
    }
    return;
  }

  if (rest.length === 0) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const obj = node as Record<string, unknown>;
      if (!(seg in obj)) return;
      const orig = obj[seg];
      if (rule.redact) {
        obj[seg] = REDACTED;
      } else if (rule.hash) {
        obj[seg] = `[HASH:${typeof orig === 'string' ? orig.length : 0}]`;
      } else if (rule.truncate && typeof orig === 'string' && orig.length > rule.truncate) {
        obj[seg] = orig.slice(0, rule.truncate) + '…';
      }
    }
    return;
  }

  if (node && typeof node === 'object' && !Array.isArray(node)) {
    applyRule((node as Record<string, unknown>)[seg], rest, rule);
  }
}

export function applySanitize<T>(value: T, rules: readonly SanitizeRule[]): T {
  if (rules.length === 0) return value;
  const cloned = JSON.parse(JSON.stringify(value)) as T;
  for (const rule of rules) {
    const segments = rule.field.split('.');
    applyRule(cloned, segments, rule);
  }
  return cloned;
}
