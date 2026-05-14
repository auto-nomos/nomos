/**
 * CloudProvider — abstraction for federated cloud IAM (Azure, AWS, GCP).
 *
 * Parallel to the OAuth `Connector` at apps/control-plane/src/oauth/connector.ts,
 * but with a different shape because cloud federation is:
 *   - Token acquisition per-request, not a one-time OAuth dance + refresh.
 *   - Three operations (mint Nomos ID token, exchange with cloud, sign+call)
 *     rather than four (authUrl / exchange / refresh / callApi).
 *   - No stored secrets — every credential is short-lived and minted on demand.
 *
 * The interface lives in `@auto-nomos/core` so the PDP (which only needs
 * the call shape) and the control-plane (which holds the implementations
 * with KMS access) agree on contract.
 *
 * Implementations live at `apps/control-plane/src/cloud/providers/<id>.ts`.
 */

export type CloudConnectorId = 'azure' | 'aws' | 'gcp';

/**
 * Per-customer cloud binding row (subset of the cloud_connections table
 * relevant to credential acquisition). The full Drizzle row is wider; the
 * provider only needs these fields.
 */
export interface CloudConnectionRef {
  id: string;
  customerId: string;
  connector: CloudConnectorId;
  /** subscription_id (Azure) | aws_account_id | gcp_project_id */
  accountId: string;
  /** Azure tenant id; null for AWS/GCP. */
  tenantId: string | null;
  /** app_object_id (Azure) | role_arn (AWS) | wif_provider (GCP) */
  externalId: string;
  /** Provider-specific config. Schema defined per implementation. */
  config: Record<string, unknown>;
}

/**
 * Stable identity Nomos asserts about the agent in the OIDC ID token's `sub`.
 * Cloud trust policies match on this exact shape:
 *   `customer/{customerId}/agent/{agentId}`
 */
export interface AgentIdentity {
  customerId: string;
  agentId: string;
  /** Optional intent id — surfaced in token claim `nomos.intent_id`. */
  intentId?: string;
  /** Optional UCAN CID — surfaced in token claim `nomos.ucan_cid`. */
  ucanCid?: string;
}

/**
 * Session credentials returned after the cloud has accepted Nomos's ID token.
 * Per-cloud shape varies; PDP treats this opaquely and hands it back to
 * `signAndCall`.
 */
export type CloudSessionCreds =
  | {
      kind: 'azure_bearer';
      accessToken: string;
      expiresAt: Date;
      scope: string;
    }
  | {
      kind: 'aws_sigv4';
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
      expiresAt: Date;
      region: string;
    }
  | {
      kind: 'gcp_bearer';
      accessToken: string;
      expiresAt: Date;
    };

export interface CloudApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Absolute URL or provider-relative path; per-provider conventions. */
  url: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface CloudApiResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * Audience claim value the provider expects in the Nomos-minted ID token.
 *   Azure: "api://AzureADTokenExchange"
 *   AWS:   "sts.amazonaws.com"
 *   GCP:   "<wif-provider-resource-name>" (per-customer)
 */
export interface IdTokenAudience {
  audience: string;
  /** Optional cloud-recommended TTL override; defaults to 5min. */
  ttlSeconds?: number;
}

export interface CloudProvider {
  id: CloudConnectorId;

  /** Audience claim the cloud expects in the OIDC ID token Nomos issues. */
  audienceFor(connection: CloudConnectionRef): IdTokenAudience;

  /**
   * Exchange a Nomos-issued ID token for short-lived cloud session creds.
   *   Azure: client_credentials grant against AAD token endpoint.
   *   AWS:   sts:AssumeRoleWithWebIdentity.
   *   GCP:   STS exchange → SA impersonation generateAccessToken.
   * Throws `CloudFederationError` on cloud-side rejection.
   */
  acquireSessionCreds(connection: CloudConnectionRef, idToken: string): Promise<CloudSessionCreds>;

  /**
   * Make a single authenticated request against the cloud's management API.
   * Provider attaches creds (bearer for Azure/GCP, SigV4 signing for AWS)
   * and returns the raw status + parsed body. Schema validation +
   * audit emission happen upstream in the PDP adapter.
   */
  signAndCall(creds: CloudSessionCreds, req: CloudApiRequest): Promise<CloudApiResponse>;
}

export class CloudFederationError extends Error {
  readonly status: number;
  readonly providerBody: unknown;
  readonly retryable: boolean;
  constructor(message: string, status: number, providerBody: unknown, retryable = false) {
    super(message);
    this.name = 'CloudFederationError';
    this.status = status;
    this.providerBody = providerBody;
    this.retryable = retryable;
  }
}
