/**
 * Observability v2 — span emitter (mcp-server, authorize-only fallback).
 *
 * For proxy-mode clients (Cursor / Claude Desktop through this server) the PDP
 * is the truth-source — it sees the full request + upstream response and emits
 * the span itself. This module covers the authorize-only fallback path where
 * the agent receives a token and calls upstream directly; mcp-server is the
 * only place that knows the outcome.
 *
 * Redaction + hashing helpers live in `@auto-nomos/shared-types/span-redact`
 * so PDP and this module never diverge.
 */
import type { AuthGuard, EmitSpanInput } from '@auto-nomos/sdk';
import {
  redactRequest,
  redactResponse,
  sha256Of,
  statusFromOutcome,
} from '@auto-nomos/shared-types';

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

export function emitSpanForToolCall(args: EmitArgs): void {
  if (!args.receiptId || args.receiptId.startsWith('sdk-')) return;

  const input: EmitSpanInput = {
    receiptId: args.receiptId,
    toolName: args.command,
    status: statusFromOutcome(args.toolStatus, args.httpStatus),
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

  if (typeof args.guard.emitSpan !== 'function') return;
  try {
    void args.guard.emitSpan(input).catch((err: unknown) => {
      // biome-ignore lint/suspicious/noConsole: best-effort debug log
      console.debug?.('[nomos] emitSpan failed:', (err as Error)?.message ?? err);
    });
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: best-effort debug log
    console.debug?.('[nomos] emitSpan threw:', (err as Error)?.message ?? err);
  }
}

export { redactRequest, redactResponse, sha256Of };
