/**
 * PDP-side cloud proxy adapter.
 *
 * Given an allow decision + a UCAN carrying `meta.cloud_connection_id`,
 * the PDP forwards the API request to the control-plane internal
 * `api-call` endpoint, which:
 *   1. Mints an OIDC ID token (signed by the issuer KMS key).
 *   2. Exchanges it with the cloud's STS/AAD/STS-GCP endpoint.
 *   3. Calls the upstream cloud API with the resulting bearer/SigV4.
 *
 * The PDP never holds cloud creds. It owns audit, step-up, and the
 * decision; the credential acquisition stays on the control-plane.
 */

export interface CloudProxyRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Absolute URL or provider-relative path (per-provider conventions). */
  url: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface CloudProxyResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  /** OIDC ID-token JTI — surfaced so audit can correlate the mint event. */
  idTokenJti: string;
  /** Connector — passed back from control-plane for audit context. */
  connector: 'azure' | 'aws' | 'gcp';
}

export interface CloudFederationFailure {
  error: 'cloud_call_failed';
  message: string;
  providerStatus: number;
  providerBody: unknown;
  retryable: boolean;
}

export class CloudCallError extends Error {
  readonly providerStatus: number;
  readonly providerBody: unknown;
  readonly retryable: boolean;
  constructor(failure: CloudFederationFailure) {
    super(failure.message);
    this.name = 'CloudCallError';
    this.providerStatus = failure.providerStatus;
    this.providerBody = failure.providerBody;
    this.retryable = failure.retryable;
  }
}

export interface CloudAdapterDeps {
  controlPlaneUrl: string;
  serviceToken: string;
  fetch?: typeof fetch;
}

/**
 * Call the control-plane `/v1/internal/cloud/api-call/:connectionId` endpoint.
 *
 * Throws `CloudCallError` on cloud-side rejection (mapped from federation
 * error). Network failures bubble as the raw fetch error so the proxy
 * route can return 502.
 */
export async function cloudApiCall(
  deps: CloudAdapterDeps,
  connectionId: string,
  agentContext: {
    customerId: string;
    agentId: string;
    intentId?: string;
    ucanCid?: string;
    /**
     * Sprint MAOS-A — chain context forwarded so CP-emitted audit rows
     * (cloud.token.minted, cloud.federation.exchanged) carry the same
     * parent_receipt_id / swarm_id / chain_depth as the PDP-emitted
     * cloud.call.allowed row. Without this, mint/exchange rows land in
     * audit_events with swarm_id=null and the swarm detail page misses
     * them in the chain walk.
     */
    parentReceiptId?: string;
    swarmId?: string;
    chainDepth?: number;
  },
  request: CloudProxyRequest,
): Promise<CloudProxyResponse> {
  const f = deps.fetch ?? globalThis.fetch;
  const url = `${deps.controlPlaneUrl}/v1/internal/cloud/api-call/${encodeURIComponent(connectionId)}`;
  const body = {
    customer_id: agentContext.customerId,
    agent_id: agentContext.agentId,
    ...(agentContext.intentId ? { intent_id: agentContext.intentId } : {}),
    ...(agentContext.ucanCid ? { ucan_cid: agentContext.ucanCid } : {}),
    ...(agentContext.parentReceiptId ? { parent_receipt_id: agentContext.parentReceiptId } : {}),
    ...(agentContext.swarmId ? { swarm_id: agentContext.swarmId } : {}),
    ...(typeof agentContext.chainDepth === 'number'
      ? { chain_depth: agentContext.chainDepth }
      : {}),
    request,
  };
  const res = await f(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${deps.serviceToken}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`cloud_api_call_non_json_${res.status}: ${raw.slice(0, 200)}`);
  }
  if (res.status === 502 || res.status === 503) {
    const data = parsed as Partial<CloudFederationFailure>;
    throw new CloudCallError({
      error: 'cloud_call_failed',
      message: data.message ?? 'cloud_call_failed',
      providerStatus: data.providerStatus ?? res.status,
      providerBody: data.providerBody,
      retryable: data.retryable ?? res.status === 503,
    });
  }
  if (res.status !== 200) {
    throw new Error(`cloud_api_call_unexpected_${res.status}`);
  }
  const data = parsed as {
    status: number;
    body: unknown;
    headers: Record<string, string>;
    id_token_jti: string;
    connector: 'azure' | 'aws' | 'gcp';
  };
  return {
    status: data.status,
    body: data.body,
    headers: data.headers,
    idTokenJti: data.id_token_jti,
    connector: data.connector,
  };
}
