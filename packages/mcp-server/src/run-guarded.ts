import type {
  AuthGuard,
  IntentClient,
  ProxyApiCall,
  ProxyResult,
  ResourceConstraint,
} from '@auto-nomos/sdk';
import { ENV_PARENT_CHAIN, readParentChainFromEnv } from '@auto-nomos/sdk';
import { emitSpanForToolCall } from './spans.js';

/**
 * Sprint MAOS-A — diagnostic. Logged once per process when the chain env
 * is unset but downstream code expected to be a child agent. Useful for
 * orchestrators (LangGraph, CrewAI) that forgot to wire the env handoff.
 */
let chainEnvWarnedOnce = false;
function maybeWarnMissingChainEnv(): void {
  if (chainEnvWarnedOnce) return;
  const ctx = readParentChainFromEnv();
  if (ctx.chain.length === 0 && process.env.NOMOS_EXPECT_PARENT_CHAIN === '1') {
    chainEnvWarnedOnce = true;
    // biome-ignore lint/suspicious/noConsole: structural-mismatch diagnostic
    console.warn(
      `[nomos] NOMOS_EXPECT_PARENT_CHAIN=1 but ${ENV_PARENT_CHAIN} is unset — ` +
        'child agent will be authorized as if it were a root agent. ' +
        'Set NOMOS_PARENT_UCAN_CHAIN on child-process spawn.',
    );
  }
}

export interface ToolResultJson {
  status: 'allowed' | 'denied' | 'failed';
  decision?: { allow: boolean; reason?: string; receiptId?: string };
  upstream?: { status: number; body: unknown };
  error?: string;
  envelopeId?: string;
}

/**
 * Mint (or reuse) a UCAN for the command, then call PDP /v1/proxy. The
 * upstream OAuth token never leaves the PDP — agents only ever see the
 * upstream response body the PDP forwards back.
 *
 * Step-up wait: when the first proxy call denies with requiresStepUp +
 * stepUpId, the function blocks on `guard.waitForApproval` (60s by
 * default). If the user approves in time the proxy is retried with the
 * cosigner JWT attached so the agent's in-flight call succeeds without
 * the agent having to retry manually.
 */
export async function runGuarded(
  guard: AuthGuard,
  command: string,
  resource: Record<string, unknown>,
  apiCall: ProxyApiCall,
): Promise<ToolResultJson> {
  maybeWarnMissingChainEnv();
  const minted = await guard.mintUcan({ commands: [command] });
  const ucan = minted.get(command);
  if (!ucan) {
    return { status: 'failed', error: `no UCAN minted for ${command}` };
  }
  const startedAt = Date.now();
  const requestArgs = {
    ...(apiCall.query ?? {}),
    ...(typeof apiCall.body === 'object' && apiCall.body
      ? (apiCall.body as Record<string, unknown>)
      : {}),
  };
  let result: ProxyResult = await guard.proxy({
    ucan: ucan.jwt,
    command,
    resource,
    context: {},
    apiCall,
  });
  // Step-up wait: if PDP denied for step-up and surfaced a stepUpId,
  // block until the user approves (or 60s timeout) then retry with
  // cosigner JWT so the agent doesn't have to.
  if (
    !result.allow &&
    result.decision.requiresStepUp &&
    result.decision.stepUpId &&
    typeof guard.waitForApproval === 'function'
  ) {
    const status = await guard.waitForApproval({ stepUpId: result.decision.stepUpId });
    if (status.state === 'approved' && status.cosignerJwt) {
      result = await guard.proxy({
        ucan: ucan.jwt,
        command,
        resource,
        context: {},
        apiCall,
        cosignerJwt: status.cosignerJwt,
      });
    }
  }
  const endedAt = Date.now();
  if (!result.allow) {
    emitSpanForToolCall({
      guard,
      receiptId: result.decision.receiptId,
      command,
      toolStatus: 'denied',
      startedAtMs: startedAt,
      endedAtMs: endedAt,
      requestArgs,
      ...(result.decision.reason ? { errorMessage: result.decision.reason } : {}),
    });
    return {
      status: 'denied',
      decision: {
        allow: false,
        ...(result.decision.reason !== undefined ? { reason: result.decision.reason } : {}),
        receiptId: result.decision.receiptId,
      },
    };
  }
  if (result.error || !result.upstream) {
    emitSpanForToolCall({
      guard,
      receiptId: result.decision.receiptId,
      command,
      toolStatus: 'failed',
      startedAtMs: startedAt,
      endedAtMs: endedAt,
      requestArgs,
      ...(result.error ? { errorMessage: result.error } : {}),
    });
    return {
      status: 'failed',
      decision: { allow: true, receiptId: result.decision.receiptId },
      ...(result.error !== undefined ? { error: result.error } : {}),
    };
  }
  emitSpanForToolCall({
    guard,
    receiptId: result.decision.receiptId,
    command,
    toolStatus: 'allowed',
    startedAtMs: startedAt,
    endedAtMs: endedAt,
    httpStatus: result.upstream.status,
    requestArgs,
    responseBody: result.upstream.body,
  });
  return {
    status: 'allowed',
    decision: { allow: true, receiptId: result.decision.receiptId },
    upstream: { status: result.upstream.status, body: result.upstream.body },
  };
}

export interface RunGuardedDynamicDeps {
  guard: AuthGuard;
  intent: IntentClient;
  /**
   * Resolve a step-up. Implementations:
   *   - stdio MCP: poll PDP via `guard.waitForApproval`.
   *   - browser host: open the deep link, await SSE / postMessage.
   */
  awaitApproval: (stepUpId: string, stepUpUrl: string) => Promise<string>;
  command: string;
  resource: Record<string, unknown>;
  constraint: ResourceConstraint;
  /** UCAN lifetime in seconds. Default 300 (5 min). */
  ttlSeconds?: number;
  apiCall: ProxyApiCall;
}

/**
 * Dynamic-mode counterpart to `runGuarded`. Acquires a per-request
 * UCAN through the Approval-Envelope flow (`/v1/intent`), then calls
 * `guard.proxy`. The agent never holds a long-lived credential — each
 * tool call is gated by a short-lived UCAN bound to a structured
 * `ResourceConstraint` the broker signs.
 */
export async function runGuardedDynamic(deps: RunGuardedDynamicDeps): Promise<ToolResultJson> {
  let grant: Awaited<ReturnType<IntentClient['acquire']>>;
  try {
    grant = await deps.intent.acquire(
      {
        constraint: deps.constraint,
        actions: [deps.command],
        ttlSeconds: deps.ttlSeconds ?? 300,
      },
      deps.awaitApproval,
    );
  } catch (err) {
    return { status: 'denied', error: (err as Error).message };
  }

  const startedAt = Date.now();
  const requestArgs = {
    ...(deps.apiCall.query ?? {}),
    ...(typeof deps.apiCall.body === 'object' && deps.apiCall.body
      ? (deps.apiCall.body as Record<string, unknown>)
      : {}),
  };

  try {
    const result: ProxyResult = await deps.guard.proxy({
      ucan: grant.ucan,
      command: deps.command,
      resource: deps.resource,
      context: {},
      apiCall: deps.apiCall,
    });
    const endedAt = Date.now();
    if (!result.allow) {
      emitSpanForToolCall({
        guard: deps.guard,
        receiptId: result.decision.receiptId,
        command: deps.command,
        toolStatus: 'denied',
        startedAtMs: startedAt,
        endedAtMs: endedAt,
        requestArgs,
        ...(result.decision.reason ? { errorMessage: result.decision.reason } : {}),
      });
      return {
        status: 'denied',
        envelopeId: grant.envelopeId,
        decision: {
          allow: false,
          ...(result.decision.reason !== undefined ? { reason: result.decision.reason } : {}),
          receiptId: result.decision.receiptId,
        },
      };
    }
    if (result.error || !result.upstream) {
      emitSpanForToolCall({
        guard: deps.guard,
        receiptId: result.decision.receiptId,
        command: deps.command,
        toolStatus: 'failed',
        startedAtMs: startedAt,
        endedAtMs: endedAt,
        requestArgs,
        ...(result.error ? { errorMessage: result.error } : {}),
      });
      return {
        status: 'failed',
        envelopeId: grant.envelopeId,
        decision: { allow: true, receiptId: result.decision.receiptId },
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
    }
    emitSpanForToolCall({
      guard: deps.guard,
      receiptId: result.decision.receiptId,
      command: deps.command,
      toolStatus: 'allowed',
      startedAtMs: startedAt,
      endedAtMs: endedAt,
      httpStatus: result.upstream.status,
      requestArgs,
      responseBody: result.upstream.body,
    });
    return {
      status: 'allowed',
      envelopeId: grant.envelopeId,
      decision: { allow: true, receiptId: result.decision.receiptId },
      upstream: { status: result.upstream.status, body: result.upstream.body },
    };
  } finally {
    grant[Symbol.dispose]();
  }
}
