/**
 * Observability v2 — span emitter.
 *
 * Wraps `AuthGuard.emitSpan` with:
 *   - SHA-256 hashing of the canonicalised request/response bodies.
 *   - Allowlist-based redaction of structured summaries (per-connector). The
 *     allowlist is conservative on purpose — anything not enumerated is
 *     dropped. Adding a new safe field is one line + a unit test.
 *   - Secret-shape regex that drops the entire summary if any allowlisted
 *     value looks like a token (Bearer / xoxb / ghp / sk_live). False
 *     positives are cheap; leaking a token is not.
 *   - Truncation of every emitted string to 256 chars so a misbehaving
 *     upstream can't blow span row sizes.
 *
 * Fire-and-forget on call sites: failures are swallowed and console-logged
 * so they never sink the tool call.
 */
import { createHash } from 'node:crypto';
import type { AuthGuard, EmitSpanInput, SpanStatus } from '@auto-nomos/sdk';

const MAX_STR_LEN = 256;
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]{8,}/,
  /\bxox[pbo]-[A-Za-z0-9-]{8,}/,
  /\bghp_[A-Za-z0-9]{16,}/,
  /\bsk_live_[A-Za-z0-9]{16,}/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

/**
 * Per-connector allowlist. Keys outside this list are dropped from the
 * summary before emit. The connector prefix is the second path segment of
 * the command (e.g. `/github/repo/create` → `github`).
 */
const REQUEST_ALLOWLIST: Record<string, string[]> = {
  github: ['owner', 'repo', 'ref', 'branch', 'sha', 'path', 'issue_number', 'pull_number'],
  slack: ['channel', 'channel_id', 'user', 'ts'],
  google: ['fileId', 'spreadsheetId', 'sheetId', 'calendarId', 'eventId', 'range'],
  google_calendar: ['calendarId', 'eventId', 'timeMin', 'timeMax'],
  google_drive: ['fileId', 'folderId', 'mimeType'],
  google_gmail: ['messageId', 'threadId', 'labelIds'],
  notion: ['page_id', 'database_id', 'block_id'],
  stripe: ['customer_id', 'subscription_id', 'invoice_id', 'amount', 'currency'],
  linear: ['issueId', 'projectId', 'teamId'],
  salesforce: ['recordId', 'objectType'],
  jira: ['issueKey', 'projectKey'],
  postgres: ['statement_kind'],
  discord: ['channel_id', 'guild_id'],
  telegram: ['chat_id'],
  dropbox: ['path'],
  twilio: ['conversation_sid', 'message_sid'],
};

const RESPONSE_ALLOWLIST = ['id', 'url', 'count', 'total', 'error_code', 'status'];

function connectorFromCommand(command: string): string | null {
  const segs = command.split('/').filter(Boolean);
  return segs[0] ?? null;
}

function truncate(v: unknown): unknown {
  if (typeof v === 'string') return v.length > MAX_STR_LEN ? `${v.slice(0, MAX_STR_LEN)}…` : v;
  if (Array.isArray(v)) return v.slice(0, 16).map(truncate);
  return v;
}

function looksLikeSecret(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return SECRET_PATTERNS.some((re) => re.test(v));
}

export function redactRequest(
  command: string,
  args: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!args) return null;
  const connector = connectorFromCommand(command);
  const allow = connector ? REQUEST_ALLOWLIST[connector] : undefined;
  if (!allow) return null;
  const out: Record<string, unknown> = {};
  for (const k of allow) {
    const v = args[k];
    if (v === undefined || v === null) continue;
    if (looksLikeSecret(v)) return null;
    out[k] = truncate(v);
  }
  return Object.keys(out).length === 0 ? null : out;
}

export function redactResponse(body: unknown): Record<string, unknown> | null {
  if (body == null || typeof body !== 'object') return null;
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of RESPONSE_ALLOWLIST) {
    const v = src[k];
    if (v === undefined || v === null) continue;
    if (looksLikeSecret(v)) return null;
    out[k] = truncate(v);
  }
  return Object.keys(out).length === 0 ? null : out;
}

export function sha256Of(value: unknown): string {
  const canonical = canonicalize(value);
  return createHash('sha256').update(canonical).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function statusFrom(
  toolStatus: 'allowed' | 'denied' | 'failed',
  httpStatus: number | undefined,
): SpanStatus {
  if (toolStatus === 'denied') return 'denied';
  if (toolStatus === 'failed') return 'failure';
  if (httpStatus !== undefined && httpStatus >= 500) return 'failure';
  if (httpStatus !== undefined && httpStatus >= 400) return 'failure';
  return 'success';
}

interface EmitArgs {
  guard: AuthGuard;
  receiptId: string | undefined;
  command: string;
  toolStatus: 'allowed' | 'denied' | 'failed';
  startedAtMs: number;
  endedAtMs: number;
  httpStatus?: number;
  errorMessage?: string;
  requestArgs?: Record<string, unknown>;
  responseBody?: unknown;
  parentSpanId?: string;
}

/**
 * Build the EmitSpanInput from a tool-call outcome and fire-and-forget the
 * POST. Failures are swallowed (logged once at debug). Caller does not
 * await; this returns immediately and the network call runs on its own.
 */
export function emitSpanForToolCall(args: EmitArgs): void {
  if (!args.receiptId || args.receiptId.startsWith('sdk-')) return;

  const input: EmitSpanInput = {
    receiptId: args.receiptId,
    toolName: args.command,
    status: statusFrom(args.toolStatus, args.httpStatus),
    startedAt: new Date(args.startedAtMs).toISOString(),
    endedAt: new Date(args.endedAtMs).toISOString(),
    latencyMs: Math.max(0, args.endedAtMs - args.startedAtMs),
    httpStatus: args.httpStatus ?? null,
    errorCode: args.toolStatus === 'denied' ? 'denied' : null,
    errorMessage: args.errorMessage ? args.errorMessage.slice(0, 1024) : null,
    requestArgsHash: sha256Of(args.requestArgs ?? null),
    requestSummary: redactRequest(args.command, args.requestArgs),
    responseHash: args.responseBody !== undefined ? sha256Of(args.responseBody) : null,
    responseSummary: redactResponse(args.responseBody),
    parentSpanId: args.parentSpanId ?? null,
  };

  // Fire-and-forget. We deliberately do not await — span emission is a
  // best-effort observability signal, not part of the tool-call contract.
  void args.guard.emitSpan(input).catch((err: unknown) => {
    // biome-ignore lint/suspicious/noConsole: best-effort debug log
    console.debug?.('[nomos] emitSpan failed:', (err as Error)?.message ?? err);
  });
}
