/**
 * Azure CloudProvider — federated credential against Azure AD.
 *
 *   1. Nomos mints an OIDC ID token with aud="api://AzureADTokenExchange".
 *   2. Provider POSTs to login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 *      with grant_type=client_credentials and a JWT bearer assertion.
 *   3. Returns AAD access token; PDP attaches as Bearer to management.azure.com.
 *
 * Token cache lives in the PDP adapter (per (connection, scope) for 15min) —
 * this provider is stateless.
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

export interface AzureProviderOptions {
  /** Injectable fetch — tests pass a mock. Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Override AAD host for tests. */
  aadHost?: string;
  /** Override ARM host for tests. */
  armHost?: string;
}

interface AzureConnectionConfig {
  /** App registration object id (the client_id for the token request). */
  app_client_id?: string;
  /** Default scope; M1 hardcodes management.azure.com/.default. */
  scope?: string;
}

const DEFAULT_SCOPE = 'https://management.azure.com/.default';
const AUDIENCE = 'api://AzureADTokenExchange';

export class AzureCloudProvider implements CloudProvider {
  readonly id = 'azure' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly aadHost: string;
  private readonly armHost: string;

  constructor(opts: AzureProviderOptions = {}) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.aadHost = opts.aadHost ?? 'https://login.microsoftonline.com';
    this.armHost = opts.armHost ?? 'https://management.azure.com';
  }

  audienceFor(_connection: CloudConnectionRef): IdTokenAudience {
    return { audience: AUDIENCE, ttlSeconds: 300 };
  }

  async acquireSessionCreds(
    connection: CloudConnectionRef,
    idToken: string,
  ): Promise<CloudSessionCreds> {
    if (connection.connector !== 'azure') {
      throw new CloudFederationError('connector_mismatch', 400, {
        connector: connection.connector,
      });
    }
    if (!connection.tenantId) {
      throw new CloudFederationError('missing_tenant_id', 400, null);
    }
    const config = connection.config as AzureConnectionConfig;
    const clientId = config.app_client_id;
    if (!clientId) {
      throw new CloudFederationError('missing_app_client_id', 400, null);
    }
    const scope = config.scope ?? DEFAULT_SCOPE;
    const url = `${this.aadHost}/${connection.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: idToken,
      scope,
    });
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const raw = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    let parsed: unknown;
    try {
      parsed = raw.length > 0 ? JSON.parse(raw) : {};
    } catch {
      throw new CloudFederationError(
        `aad_non_json_${res.status}: ${raw.slice(0, 200)}`,
        res.status,
        raw,
        retryable,
      );
    }
    if (!res.ok) {
      throw new CloudFederationError(
        `aad_token_exchange_failed_${res.status}`,
        res.status,
        parsed,
        retryable,
      );
    }
    const data = parsed as Record<string, unknown>;
    const accessToken = data.access_token;
    const expiresIn = data.expires_in;
    if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
      throw new CloudFederationError('aad_malformed_response', res.status, parsed);
    }
    return {
      kind: 'azure_bearer',
      accessToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scope,
    };
  }

  async signAndCall(creds: CloudSessionCreds, req: CloudApiRequest): Promise<CloudApiResponse> {
    if (creds.kind !== 'azure_bearer') {
      throw new CloudFederationError('creds_kind_mismatch', 400, { kind: creds.kind });
    }
    const url = absoluteUrl(req.url, this.armHost, req.query);
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
    const raw = await res.text();
    let body: unknown;
    try {
      body = raw.length > 0 ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status: res.status, body, headers };
  }
}

function absoluteUrl(pathOrUrl: string, base: string, query?: Record<string, string>): string {
  const url = pathOrUrl.startsWith('http') ? new URL(pathOrUrl) : new URL(pathOrUrl, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}
