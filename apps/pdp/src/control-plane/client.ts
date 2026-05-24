/**
 * PDP-side client for the control-plane internal endpoints.
 *
 * Verifies the Ed25519 signature on every signed bundle response. If verify
 * fails, the bundle is dropped (caller keeps stale) and the failure is
 * surfaced via logger + Sentry.
 */
import { verifyDetached } from '@auto-nomos/crypto';
import type { EmitSpanInput } from '@auto-nomos/shared-types';
import { base64urlToBytes, canonicalize } from '@auto-nomos/ucan';
import { hexToBytes } from '@noble/hashes/utils';
import type { AgentMeta, BundleEntry } from '../cache/policies.js';
import type { Logger } from '../logger.js';

interface BundlePolicy {
  id: string;
  name: string;
  integrationId: string | null;
  cedarText: string;
  version: number;
}

interface BundleAgentDto {
  agentId: string;
  did: string;
  mode: 'static' | 'dynamic';
  status: 'active' | 'disabled' | 'deleted';
  connectionApprovedAt: string | null;
}

interface SignedBundleResponse {
  bundle: {
    customer_id: string;
    version: number;
    generated_at: string;
    policies: BundlePolicy[];
    agents?: BundleAgentDto[];
    schema_hash: string;
  };
  signature: string;
  signerDid: string;
}

interface RevocationsResponse {
  customer_id: string;
  revoked: string[];
}

export interface ControlPlaneClientOptions {
  baseUrl: string;
  serviceToken: string;
  /** hex-encoded ed25519 public key. If absent, signature verification is skipped (dev-only fallback). */
  bundleVerifyKey?: string;
  logger: Logger;
  /** Inject for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  onSignatureFailure?: (err: Error) => void;
}

export interface OAuthTokenResponse {
  connectionId: string;
  customerId: string;
  connector: string;
  accountId: string;
  accessToken: string;
  accessTokenExpiresAt: string | null;
  scopesGranted: string[];
}

export interface StepUpCreateResponse {
  id: string;
  expiresAt: string;
  deepLink: string;
}

export interface StepUpStateResponse {
  id: string;
  customerId: string;
  agentId: string;
  command: string;
  resource: unknown;
  state: 'pending' | 'approved' | 'denied' | 'expired';
  expiresAt: string;
  decidedAt: string | null;
  cosignerAttestationJwt: string | null;
  /** Set once the cosigner has been consumed (audit C5, single-use). */
  cosignerUsedAt: string | null;
}

export interface ConsumeStepUpResult {
  consumed: boolean;
}

export interface ControlPlaneClient {
  /** Discover all customers the control plane knows about. PDP polls this
   *  on a slow interval so a new tenant doesn't need a PDP restart. */
  fetchCustomerIds(): Promise<string[]>;
  fetchBundle(customerId: string): Promise<BundleEntry | undefined>;
  fetchRevocations(customerId: string): Promise<string[] | undefined>;
  fetchOAuthToken(customerId: string, connectionId: string): Promise<OAuthTokenResponse>;
  /**
   * Force-refresh the access token for a connection. PDP calls this after a
   * 401 from upstream so the next retry uses a fresh token. Throws
   * OAuthTokenFetchError when the control plane refuses (refresh token
   * itself rejected by provider — caller should deny `oauth_token_invalid`).
   */
  refreshOAuthToken(customerId: string, connectionId: string): Promise<OAuthTokenResponse>;
  /**
   * Sprint 9 — step-up. PDP detects step-up potential during authorize and
   * asks the control plane to create a push_approvals row + Knock fan-out.
   */
  createStepUp(args: {
    customerId: string;
    agentId: string;
    command: string;
    resource: Record<string, unknown>;
    ttlSeconds?: number;
    originalUcanCid?: string;
  }): Promise<StepUpCreateResponse>;
  getStepUp(id: string): Promise<StepUpStateResponse | undefined>;
  /**
   * Audit C5 — single-use cosigner enforcement. PDP calls this after
   * validateCosigner returns ok; the control-plane atomically CAS-marks
   * the approval as used. `{ consumed: false }` means another caller won
   * the race (or the approval state changed); PDP must deny with
   * `cosigner_already_used`.
   */
  consumeStepUp(id: string): Promise<ConsumeStepUpResult>;
  /**
   * Best-effort span emit. PDP calls this fire-and-forget after every
   * /v1/proxy invocation completes so the control-plane records what the
   * upstream call actually did (status, latency, payload hashes). Never
   * throws to callers — errors are logged and swallowed.
   */
  emitSpan(args: { customerId: string; agentDid: string; input: EmitSpanInput }): Promise<void>;
}

export class OAuthTokenFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'OAuthTokenFetchError';
    this.status = status;
  }
}

const encoder = new TextEncoder();

export function createControlPlaneClient(opts: ControlPlaneClientOptions): ControlPlaneClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const verifyKey = opts.bundleVerifyKey ? hexToBytes(opts.bundleVerifyKey) : undefined;

  if (!verifyKey) {
    opts.logger.warn(
      'CONTROL_PLANE_BUNDLE_VERIFY_KEY not set — bundle signature verification SKIPPED. Acceptable for local dev only.',
    );
  }

  async function fetchBundle(customerId: string): Promise<BundleEntry | undefined> {
    const res = await fetchImpl(`${opts.baseUrl}/v1/internal/bundles/${customerId}`, {
      headers: { authorization: `Bearer ${opts.serviceToken}` },
    });
    if (!res.ok) {
      throw new Error(`bundle fetch ${res.status} for customer ${customerId}`);
    }
    const body = (await res.json()) as SignedBundleResponse;

    if (verifyKey) {
      const sig = base64urlToBytes(body.signature);
      const payload = encoder.encode(canonicalize(body.bundle));
      if (!verifyDetached(verifyKey, payload, sig)) {
        const err = new Error(
          `bundle signature verification failed for customer ${customerId} (signer=${body.signerDid})`,
        );
        opts.logger.error({ customerId, signerDid: body.signerDid }, err.message);
        opts.onSignatureFailure?.(err);
        // Caller treats `undefined` as "keep stale" per cache contract.
        throw err;
      }
    }

    if (body.bundle.customer_id !== customerId) {
      throw new Error(
        `bundle customer mismatch: requested ${customerId}, got ${body.bundle.customer_id}`,
      );
    }

    // Cedar parses multiple policies separated by `;` newlines. Concatenate.
    const cedar = body.bundle.policies.map((p) => p.cedarText).join('\n\n');
    const agents: AgentMeta[] = (body.bundle.agents ?? []).map((a) => ({
      agentId: a.agentId,
      did: a.did,
      mode: a.mode,
      status: a.status,
      connectionApprovedAt: a.connectionApprovedAt,
    }));
    return { cedar, agents };
  }

  async function fetchRevocations(customerId: string): Promise<string[] | undefined> {
    const res = await fetchImpl(`${opts.baseUrl}/v1/internal/revocations/${customerId}`, {
      headers: { authorization: `Bearer ${opts.serviceToken}` },
    });
    if (!res.ok) {
      throw new Error(`revocations fetch ${res.status} for customer ${customerId}`);
    }
    const body = (await res.json()) as RevocationsResponse;
    return body.revoked;
  }

  async function fetchOAuthToken(
    customerId: string,
    connectionId: string,
  ): Promise<OAuthTokenResponse> {
    const res = await fetchImpl(
      `${opts.baseUrl}/v1/internal/oauth-tokens/${connectionId}?customerId=${encodeURIComponent(customerId)}`,
      { headers: { authorization: `Bearer ${opts.serviceToken}` } },
    );
    if (!res.ok) {
      throw new OAuthTokenFetchError(
        `oauth token fetch HTTP ${res.status} for connection ${connectionId}`,
        res.status,
      );
    }
    return (await res.json()) as OAuthTokenResponse;
  }

  async function refreshOAuthToken(
    customerId: string,
    connectionId: string,
  ): Promise<OAuthTokenResponse> {
    const res = await fetchImpl(
      `${opts.baseUrl}/v1/internal/oauth-tokens/${connectionId}/refresh?customerId=${encodeURIComponent(customerId)}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.serviceToken}` },
      },
    );
    if (!res.ok) {
      throw new OAuthTokenFetchError(
        `oauth token refresh HTTP ${res.status} for connection ${connectionId}`,
        res.status,
      );
    }
    return (await res.json()) as OAuthTokenResponse;
  }

  async function createStepUp(args: {
    customerId: string;
    agentId: string;
    command: string;
    resource: Record<string, unknown>;
    ttlSeconds?: number;
    originalUcanCid?: string;
  }): Promise<StepUpCreateResponse> {
    const res = await fetchImpl(`${opts.baseUrl}/v1/internal/stepup/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.serviceToken}`,
      },
      body: JSON.stringify({
        customer_id: args.customerId,
        agent_id: args.agentId,
        command: args.command,
        resource: args.resource,
        ...(args.ttlSeconds !== undefined ? { ttl_seconds: args.ttlSeconds } : {}),
        ...(args.originalUcanCid !== undefined ? { original_ucan_cid: args.originalUcanCid } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`stepup create HTTP ${res.status}`);
    }
    const body = (await res.json()) as { id: string; expires_at: string; deep_link: string };
    return { id: body.id, expiresAt: body.expires_at, deepLink: body.deep_link };
  }

  async function getStepUp(id: string): Promise<StepUpStateResponse | undefined> {
    const res = await fetchImpl(`${opts.baseUrl}/v1/internal/stepup/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${opts.serviceToken}` },
    });
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new Error(`stepup fetch HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      id: string;
      customer_id: string;
      agent_id: string;
      command: string;
      resource: unknown;
      state: 'pending' | 'approved' | 'denied' | 'expired';
      expires_at: string;
      decided_at: string | null;
      cosigner_attestation_jwt: string | null;
      cosigner_used_at?: string | null;
    };
    return {
      id: body.id,
      customerId: body.customer_id,
      agentId: body.agent_id,
      command: body.command,
      resource: body.resource,
      state: body.state,
      expiresAt: body.expires_at,
      decidedAt: body.decided_at,
      cosignerAttestationJwt: body.cosigner_attestation_jwt,
      cosignerUsedAt: body.cosigner_used_at ?? null,
    };
  }

  async function consumeStepUp(id: string): Promise<ConsumeStepUpResult> {
    const res = await fetchImpl(
      `${opts.baseUrl}/v1/internal/stepup/${encodeURIComponent(id)}/consume`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.serviceToken}` },
      },
    );
    if (res.status === 409) return { consumed: false };
    if (!res.ok) {
      throw new Error(`stepup consume HTTP ${res.status}`);
    }
    const body = (await res.json()) as { consumed: boolean };
    return { consumed: body.consumed === true };
  }

  async function emitSpan(args: {
    customerId: string;
    agentDid: string;
    input: EmitSpanInput;
  }): Promise<void> {
    try {
      const res = await fetchImpl(`${opts.baseUrl}/v1/internal/spans/emit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.serviceToken}`,
        },
        body: JSON.stringify({
          customerId: args.customerId,
          agentDid: args.agentDid,
          ...args.input,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        opts.logger.warn(
          { status: res.status, body, receiptId: args.input.receiptId },
          'pdp span emit non-ok',
        );
      }
    } catch (err) {
      opts.logger.warn({ err, receiptId: args.input.receiptId }, 'pdp span emit failed');
    }
  }

  async function fetchCustomerIds(): Promise<string[]> {
    const res = await fetchImpl(`${opts.baseUrl}/v1/internal/customers`, {
      headers: { authorization: `Bearer ${opts.serviceToken}` },
    });
    if (!res.ok) {
      throw new Error(`customers fetch ${res.status}`);
    }
    const body = (await res.json()) as { customers?: { id: string }[] };
    return (body.customers ?? []).map((c) => c.id);
  }

  return {
    fetchCustomerIds,
    fetchBundle,
    fetchRevocations,
    fetchOAuthToken,
    refreshOAuthToken,
    createStepUp,
    getStepUp,
    consumeStepUp,
    emitSpan,
  };
}
