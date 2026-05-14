/**
 * Span redaction + hashing helpers shared by every span emitter.
 *
 * Kept in shared-types so both `@auto-nomos/mcp-server` (authorize-only
 * fallback path) and the PDP `/v1/proxy` route (proxy-mode primary path) use
 * identical allowlist + secret-shape rules. Drift between emitters means
 * partial coverage in the action graph.
 */
import { createHash } from 'node:crypto';

import type { SpanStatus } from './spans.js';

const MAX_STR_LEN = 256;

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]{8,}/,
  /\bxox[pbo]-[A-Za-z0-9-]{8,}/,
  /\bghp_[A-Za-z0-9]{16,}/,
  /\bsk_live_[A-Za-z0-9]{16,}/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

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
  args: Record<string, unknown> | undefined | null,
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

export function sha256Of(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

export function statusFromOutcome(
  toolStatus: 'allowed' | 'denied' | 'failed',
  httpStatus: number | undefined,
): SpanStatus {
  if (toolStatus === 'denied') return 'denied';
  if (toolStatus === 'failed') return 'failure';
  if (httpStatus !== undefined && httpStatus >= 400) return 'failure';
  return 'success';
}
