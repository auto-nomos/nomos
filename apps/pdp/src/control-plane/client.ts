/**
 * PDP-side client for the control-plane internal endpoints.
 *
 * Verifies the Ed25519 signature on every signed bundle response. If verify
 * fails, the bundle is dropped (caller keeps stale) and the failure is
 * surfaced via logger + Sentry.
 */
import { verifyDetached } from '@credential-broker/crypto';
import { base64urlToBytes, canonicalize } from '@credential-broker/ucan';
import { hexToBytes } from '@noble/hashes/utils';
import type { Logger } from '../logger.js';

interface BundlePolicy {
  id: string;
  name: string;
  integrationId: string | null;
  cedarText: string;
  version: number;
}

interface SignedBundleResponse {
  bundle: {
    customer_id: string;
    version: number;
    generated_at: string;
    policies: BundlePolicy[];
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
}

export interface ControlPlaneClient {
  fetchBundle(customerId: string): Promise<string | undefined>;
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
  }): Promise<StepUpCreateResponse>;
  getStepUp(id: string): Promise<StepUpStateResponse | undefined>;
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

  async function fetchBundle(customerId: string): Promise<string | undefined> {
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
    return body.bundle.policies.map((p) => p.cedarText).join('\n\n');
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
    };
  }

  return {
    fetchBundle,
    fetchRevocations,
    fetchOAuthToken,
    refreshOAuthToken,
    createStepUp,
    getStepUp,
  };
}
