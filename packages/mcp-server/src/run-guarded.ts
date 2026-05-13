import type {
  AuthGuard,
  IntentClient,
  ProxyApiCall,
  ProxyResult,
  ResourceConstraint,
} from '@auto-nomos/sdk';

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
  const minted = await guard.mintUcan({ commands: [command] });
  const ucan = minted.get(command);
  if (!ucan) {
    return { status: 'failed', error: `no UCAN minted for ${command}` };
  }
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
  if (!result.allow) {
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
    return {
      status: 'failed',
      decision: { allow: true, receiptId: result.decision.receiptId },
      ...(result.error !== undefined ? { error: result.error } : {}),
    };
  }
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

  try {
    const result: ProxyResult = await deps.guard.proxy({
      ucan: grant.ucan,
      command: deps.command,
      resource: deps.resource,
      context: {},
      apiCall: deps.apiCall,
    });
    if (!result.allow) {
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
      return {
        status: 'failed',
        envelopeId: grant.envelopeId,
        decision: { allow: true, receiptId: result.decision.receiptId },
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
    }
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
