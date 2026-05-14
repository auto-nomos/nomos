/**
 * GCP CloudProvider — Workload Identity Federation + SA impersonation.
 *
 *   1. Nomos mints an OIDC ID token with aud=<wif-provider-resource-name>.
 *   2. POST to sts.googleapis.com:token (exchange for federated access token).
 *   3. POST to iamcredentials.googleapis.com:generateAccessToken (impersonate SA).
 *   4. Returned access_token is a Bearer for *.googleapis.com.
 *
 * Two-hop is the GCP-recommended path: the federated token from STS can
 * only impersonate, not call services directly. The SA impersonation
 * gives us a clean OAuth2 access token with the SA's scopes.
 */

import type {
  CloudApiRequest,
  CloudApiResponse,
  CloudConnectionRef,
  CloudProvider,
  CloudSessionCreds,
  IdTokenAudience,
} from '@auto-nomos/core';
import { CloudFederationError } from '@auto-nomos/core';

export interface GcpProviderOptions {
  fetch?: typeof fetch;
  /** Override STS host for tests. */
  stsHost?: string;
  /** Override IAM Credentials host for tests. */
  iamCredentialsHost?: string;
  /** Override default googleapis host for signAndCall (relative URLs). */
  defaultApiHost?: string;
}

interface GcpConnectionConfig {
  /** Full WIF provider resource name (used as the token aud). */
  wif_provider?: string;
  /** Service account email to impersonate. */
  service_account_email?: string;
  /** Default scopes for the impersonation token. */
  scopes?: string[];
}

const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

export class GcpCloudProvider implements CloudProvider {
  readonly id = 'gcp' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly stsHost: string;
  private readonly iamCredentialsHost: string;
  private readonly defaultApiHost: string;

  constructor(opts: GcpProviderOptions = {}) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.stsHost = opts.stsHost ?? 'https://sts.googleapis.com';
    this.iamCredentialsHost = opts.iamCredentialsHost ?? 'https://iamcredentials.googleapis.com';
    this.defaultApiHost = opts.defaultApiHost ?? 'https://www.googleapis.com';
  }

  audienceFor(connection: CloudConnectionRef): IdTokenAudience {
    const cfg = connection.config as GcpConnectionConfig;
    if (!cfg.wif_provider) {
      throw new CloudFederationError('missing_wif_provider', 400, null);
    }
    // GCP expects the audience to be the full WIF provider resource name
    // prefixed with `//iam.googleapis.com/`.
    const audience = cfg.wif_provider.startsWith('//')
      ? cfg.wif_provider
      : `//iam.googleapis.com/${cfg.wif_provider}`;
    return { audience, ttlSeconds: 300 };
  }

  async acquireSessionCreds(
    connection: CloudConnectionRef,
    idToken: string,
  ): Promise<CloudSessionCreds> {
    if (connection.connector !== 'gcp') {
      throw new CloudFederationError('connector_mismatch', 400, {
        connector: connection.connector,
      });
    }
    const cfg = connection.config as GcpConnectionConfig;
    if (!cfg.wif_provider) {
      throw new CloudFederationError('missing_wif_provider', 400, null);
    }
    if (!cfg.service_account_email) {
      throw new CloudFederationError('missing_service_account_email', 400, null);
    }
    const audience = cfg.wif_provider.startsWith('//')
      ? cfg.wif_provider
      : `//iam.googleapis.com/${cfg.wif_provider}`;

    // Hop 1 — STS token exchange.
    const stsRes = await this.fetchImpl(`${this.stsHost}/v1/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        audience,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        subject_token: idToken,
      }).toString(),
    });
    const stsRaw = await stsRes.text();
    if (!stsRes.ok) {
      throw new CloudFederationError(
        `gcp_sts_exchange_failed_${stsRes.status}: ${stsRaw.slice(0, 200)}`,
        stsRes.status,
        stsRaw,
        stsRes.status === 429 || stsRes.status >= 500,
      );
    }
    const stsJson = parseJson(stsRaw) as { access_token?: string };
    if (!stsJson.access_token) {
      throw new CloudFederationError('gcp_sts_malformed_response', stsRes.status, stsRaw);
    }
    const federatedToken = stsJson.access_token;

    // Hop 2 — SA impersonation.
    const impUrl = `${this.iamCredentialsHost}/v1/projects/-/serviceAccounts/${encodeURIComponent(cfg.service_account_email)}:generateAccessToken`;
    const impRes = await this.fetchImpl(impUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${federatedToken}`,
      },
      body: JSON.stringify({
        scope: cfg.scopes ?? DEFAULT_SCOPES,
        lifetime: '3600s',
      }),
    });
    const impRaw = await impRes.text();
    if (!impRes.ok) {
      throw new CloudFederationError(
        `gcp_impersonate_failed_${impRes.status}: ${impRaw.slice(0, 200)}`,
        impRes.status,
        impRaw,
        impRes.status === 429 || impRes.status >= 500,
      );
    }
    const impJson = parseJson(impRaw) as { accessToken?: string; expireTime?: string };
    if (!impJson.accessToken || !impJson.expireTime) {
      throw new CloudFederationError('gcp_impersonate_malformed_response', impRes.status, impRaw);
    }
    return {
      kind: 'gcp_bearer',
      accessToken: impJson.accessToken,
      expiresAt: new Date(impJson.expireTime),
    };
  }

  async signAndCall(creds: CloudSessionCreds, req: CloudApiRequest): Promise<CloudApiResponse> {
    if (creds.kind !== 'gcp_bearer') {
      throw new CloudFederationError('creds_kind_mismatch', 400, { kind: creds.kind });
    }
    const url = absoluteUrlGcp(req.url, this.defaultApiHost, req.query);
    const res = await this.fetchImpl(url, {
      method: req.method,
      headers: {
        authorization: `Bearer ${creds.accessToken}`,
        accept: 'application/json',
        ...(req.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(req.headers ?? {}),
      },
      ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
    });
    const text = await res.text();
    let body: unknown = text;
    if (text.length > 0 && (res.headers.get('content-type') ?? '').includes('json')) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status: res.status, body, headers };
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function absoluteUrlGcp(pathOrUrl: string, base: string, query?: Record<string, string>): string {
  const url = pathOrUrl.startsWith('http') ? new URL(pathOrUrl) : new URL(pathOrUrl, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}
