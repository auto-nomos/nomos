import type { AuthGuard, ProxyApiCall, ProxyResult } from '@credential-broker/sdk';

export interface ToolResultJson {
  status: 'allowed' | 'denied' | 'failed';
  decision?: { allow: boolean; reason?: string; receiptId?: string };
  upstream?: { status: number; body: unknown };
  error?: string;
}

/**
 * Mint (or reuse) a UCAN for the command, then call PDP /v1/proxy. The
 * upstream OAuth token never leaves the PDP — agents only ever see the
 * upstream response body the PDP forwards back.
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
  const result: ProxyResult = await guard.proxy({
    ucan: ucan.jwt,
    command,
    resource,
    context: {},
    apiCall,
  });
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
