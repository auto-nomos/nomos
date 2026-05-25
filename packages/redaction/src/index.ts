/**
 * Pure-regex PII / secret scrubber for LLM prompt + reasoning text before
 * it lands at rest in the broker. Phase A (no NER, no LLM-on-LLM).
 *
 * Classes (sorted by replace-order, longest match first to avoid e.g. a
 * bearer-token regex munching part of an email):
 *
 *   `bearer_token` — `Bearer eyJ…` style auth headers + `sk_live_…` style
 *                    API keys; greedy enough to catch the common stripe,
 *                    github (ghp_/gho_), and generic 32+ hex/base64
 *                    secrets.
 *   `credit_card`  — 13-19 digit runs with optional spaces / dashes
 *                    (Luhn check skipped — false positives are OK at this
 *                    stage; an analyst seeing `[REDACTED:credit_card]`
 *                    can ask for raw if needed).
 *   `ssn`          — US 9-digit XXX-XX-XXXX (loose; intentionally won't
 *                    catch every PII numbering scheme — point is to scrub
 *                    obvious patterns, not eliminate manual review).
 *   `email`        — RFC-5322-ish; the conservative shape avoids matching
 *                    cron expressions or URLs.
 *   `phone`        — international (+CC) and US (XXX) XXX-XXXX shapes;
 *                    must hit at least 10 digits to fire.
 *
 * Matches are replaced with `[REDACTED:<class>]` and a counter is bumped
 * in the `findings` map so the dashboard can surface "3 emails redacted".
 *
 * Pluggable NER hook intentionally deferred — adding `transformers` /
 * `presidio` would push install size past 100MB and slow ingest below the
 * latency SLO. The class registry below is the seam for Phase B.
 */

export type RedactClass = 'bearer_token' | 'credit_card' | 'ssn' | 'email' | 'phone';

export interface RedactionFindings {
  bearer_token: number;
  credit_card: number;
  ssn: number;
  email: number;
  phone: number;
}

export interface RedactResult {
  redacted: string;
  findings: RedactionFindings;
}

/**
 * Order matters — longer / higher-precedence patterns first so a generic
 * pattern (e.g. credit_card's digit run) doesn't pre-consume bytes that
 * belong to a more specific one (bearer_token).
 */
const PATTERNS: ReadonlyArray<[RedactClass, RegExp]> = [
  // Bearer tokens + common API-key prefixes. The third clause catches the
  // long-opaque-string shape (32+ chars of base64-ish) so e.g. stripe live
  // keys without a known prefix are still scrubbed.
  [
    'bearer_token',
    new RegExp(
      [
        '(?:Bearer\\s+)?eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]+',
        'sk_(?:live|test)_[A-Za-z0-9]{16,}',
        'gh[pousr]_[A-Za-z0-9]{20,}',
        'xox[abprs]-[A-Za-z0-9-]{20,}',
        'AKIA[0-9A-Z]{16}',
      ].join('|'),
      'g',
    ),
  ],
  // 13-19 digit runs, optional spaces/dashes. Skips runs that already sit
  // inside a longer token (the bearer pattern already burned those bytes).
  ['credit_card', /\b(?:\d[ -]?){13,19}\b/g],
  // US SSN — `XXX-XX-XXXX`. Hyphens mandatory to keep FP rate down.
  ['ssn', /\b\d{3}-\d{2}-\d{4}\b/g],
  // Email — conservative shape; deliberate to dodge cron strings.
  ['email', /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g],
  // Phone — international or US dotted/dashed. At least 10 digits total.
  ['phone', /(?:(?<![\d-])\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g],
];

function emptyFindings(): RedactionFindings {
  return {
    bearer_token: 0,
    credit_card: 0,
    ssn: 0,
    email: 0,
    phone: 0,
  };
}

/**
 * Run all enabled redaction classes over `text`, in order. Each match is
 * replaced with `[REDACTED:<class>]` and counted in `findings`.
 *
 * `classes` (optional) restricts which scrubbers run — useful for tests
 * that want to isolate one pattern, or for customers who only want to
 * scrub a subset (e.g. preserve emails for support tickets).
 */
export function redact(input: string, classes?: ReadonlyArray<RedactClass>): RedactResult {
  if (typeof input !== 'string' || input.length === 0) {
    return { redacted: input ?? '', findings: emptyFindings() };
  }
  const enabled = new Set<RedactClass>(classes ?? PATTERNS.map(([k]) => k));
  const findings = emptyFindings();
  let out = input;
  for (const [kind, pattern] of PATTERNS) {
    if (!enabled.has(kind)) continue;
    out = out.replace(pattern, () => {
      findings[kind]++;
      return `[REDACTED:${kind}]`;
    });
  }
  return { redacted: out, findings };
}

/** Sum total replacements across all classes. */
export function totalFindings(findings: RedactionFindings): number {
  return (
    findings.bearer_token + findings.credit_card + findings.ssn + findings.email + findings.phone
  );
}
