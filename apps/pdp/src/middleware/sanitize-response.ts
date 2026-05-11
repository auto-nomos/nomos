/**
 * Response sanitizer — strips secrets, HTML, and zero-width Unicode from
 * upstream API bodies before they reach the agent.
 *
 * Defense-in-depth against two threats:
 *   1. Credential exfil: a misconfigured endpoint or a chained API response
 *      could leak tokens (GitHub PAT, Slack xox*, JWT, AWS keys) into the
 *      body the agent will see and potentially log.
 *   2. Prompt injection via API responses: HTML / zero-width Unicode in
 *      string fields can carry hidden instructions to downstream LLMs.
 *
 * Pure function. Buffered bodies (proxy.ts buffers via res.text()), so
 * synchronous traversal is fine. Recursion capped at MAX_DEPTH to bound
 * worst-case work.
 */
const MAX_DEPTH = 32;

interface SecretPattern {
  kind: string;
  re: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { kind: 'github_pat', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { kind: 'slack_token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'jwt', re: /\bey[A-Za-z0-9_-]{8,}\.ey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: 'aws_access_key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    kind: 'google_oauth_token',
    re: /\bya29\.[A-Za-z0-9_-]{20,}\b/g,
  },
];

const SENSITIVE_KEY_RE = /(token|secret|api[_-]?key|password|passwd|authorization|credential)/i;
const HIGH_ENTROPY_RE = /^[A-Za-z0-9+/=_-]{40,}$/;

const ZERO_WIDTH_RE = /[​-‏‪-‮⁠-⁤﻿]/g;
const HTML_TAG_RE = /<\/?[a-zA-Z][^<>]{0,500}>/g;

export interface SanitizeResult {
  body: unknown;
  redactions: string[];
}

export function sanitizeResponseBody(body: unknown, contentType?: string): SanitizeResult {
  const redactions: string[] = [];
  const stripHtml = !contentType || !contentType.includes('text/html');
  const ctx: Ctx = { redactions, stripHtml };
  const sanitized = walk(body, 0, ctx, undefined);
  return { body: sanitized, redactions };
}

interface Ctx {
  redactions: string[];
  stripHtml: boolean;
}

function walk(value: unknown, depth: number, ctx: Ctx, key: string | undefined): unknown {
  if (depth > MAX_DEPTH) return value;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value, ctx, key);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, depth + 1, ctx, key));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = walk(v, depth + 1, ctx, k);
    }
    return out;
  }
  return value;
}

function sanitizeString(input: string, ctx: Ctx, key: string | undefined): string {
  let s = input;

  for (const { kind, re } of SECRET_PATTERNS) {
    if (re.test(s)) {
      ctx.redactions.push(kind);
      s = s.replace(re, `[REDACTED:${kind}]`);
    }
    re.lastIndex = 0;
  }

  if (key && SENSITIVE_KEY_RE.test(key) && HIGH_ENTROPY_RE.test(s)) {
    ctx.redactions.push('sensitive_key');
    s = `[REDACTED:sensitive_key]`;
  }

  if (ctx.stripHtml && HTML_TAG_RE.test(s)) {
    ctx.redactions.push('html_tag');
    s = s.replace(HTML_TAG_RE, '');
    HTML_TAG_RE.lastIndex = 0;
  }

  if (ZERO_WIDTH_RE.test(s)) {
    ctx.redactions.push('zero_width');
    s = s.replace(ZERO_WIDTH_RE, '');
    ZERO_WIDTH_RE.lastIndex = 0;
  }

  return s;
}
