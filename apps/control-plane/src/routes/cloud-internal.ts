/**
 * Internal cloud-federation routes.
 *
 *   POST /v1/internal/cloud/api-call/:connectionId
 *     body: { customer_id, agent_id, intent_id?, ucan_cid?, request: CloudApiRequest }
 *     200:  { status, body, headers }
 *     404:  connection_not_found
 *     502:  cloud_call_failed (non-retryable)
 *     503:  cloud_call_failed (retryable — AAD 429/5xx)
 *
 *   POST /v1/internal/cloud/session-creds/:connectionId
 *     body: { customer_id, agent_id, intent_id?, ucan_cid? }
 *     200:  { connection_id, connector, creds, id_token_jti }
 *     (For callers that need creds directly — caching layer, agent-in-cloud
 *      handshake. PDP normally uses api-call.)
 *
 * Both endpoints share the mint + provider lookup logic.
 */

import type {
  CloudApiRequest,
  CloudConnectorId,
  CloudProvider,
  CloudSessionCreds,
} from '@auto-nomos/core';
import { CloudFederationError } from '@auto-nomos/core';
import type { JwtSigner } from '@auto-nomos/crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { type CloudConnectionRow, loadCloudConnection } from '../cloud/connections.js';
import { type CredsCache, scopeKey } from '../cloud/creds-cache.js';
import { getCloudProvider } from '../cloud/registry.js';
import type { Db } from '../db/index.js';
import { internalAuth } from '../middleware/internal-auth.js';
import { mintIdToken } from '../oidc/mint.js';
import {
  type CloudAuditPublisher,
  noopCloudAuditPublisher,
} from '../services/cloud-audit-publisher.js';

export interface CloudInternalDeps {
  db: Db;
  serviceToken: string;
  issuer: string;
  signer: JwtSigner;
  defaultTtlSeconds: number;
  registry: Map<CloudConnectorId, CloudProvider>;
  /** Optional session-creds cache. When omitted, every request mints+exchanges. */
  credsCache?: CredsCache;
  /** PDP-side publisher for cloud.token.minted + cloud.federation.exchanged audit rows. */
  auditPublisher?: CloudAuditPublisher;
}

const baseBody = z.object({
  customer_id: z.string().min(1),
  agent_id: z.string().min(1),
  intent_id: z.string().optional(),
  ucan_cid: z.string().optional(),
});

const apiCallBody = baseBody.extend({
  request: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z.string().min(1),
    query: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
});

export function createCloudInternalRoutes(deps: CloudInternalDeps): Hono {
  const app = new Hono();
  const audit = deps.auditPublisher ?? noopCloudAuditPublisher();
  app.use('/v1/internal/cloud/*', internalAuth(deps.serviceToken));

  app.post('/v1/internal/cloud/session-creds/:connectionId', async (c) => {
    const connectionId = c.req.param('connectionId');
    const parsed = await parseJson(c, baseBody);
    if ('error' in parsed) return parsed.response;
    const ctx = await resolve(deps, connectionId, parsed.value);
    if ('error' in ctx) return ctx.response;
    void audit.publish({
      kind: 'cloud.token.minted',
      customerId: parsed.value.customer_id,
      agentId: parsed.value.agent_id,
      connectionId: ctx.connection.id,
      connector: ctx.connection.connector,
      jti: ctx.idToken.jti,
    });
    try {
      const creds = await ctx.provider.acquireSessionCreds(ctx.connection, ctx.idToken.token);
      void audit.publish({
        kind: 'cloud.federation.exchanged',
        customerId: parsed.value.customer_id,
        agentId: parsed.value.agent_id,
        connectionId: ctx.connection.id,
        connector: ctx.connection.connector,
        jti: ctx.idToken.jti,
      });
      return c.json({
        connection_id: ctx.connection.id,
        connector: ctx.connection.connector,
        creds: serializeCreds(creds),
        id_token_jti: ctx.idToken.jti,
      });
    } catch (err) {
      void audit.publish({
        kind: 'cloud.federation.exchanged.failed',
        customerId: parsed.value.customer_id,
        agentId: parsed.value.agent_id,
        connectionId: ctx.connection.id,
        connector: ctx.connection.connector,
        jti: ctx.idToken.jti,
        retryable: err instanceof CloudFederationError ? err.retryable : false,
        error: err instanceof Error ? err.message : String(err),
      });
      return federationErrorToResponse(c, err);
    }
  });

  app.post('/v1/internal/cloud/api-call/:connectionId', async (c) => {
    const connectionId = c.req.param('connectionId');
    const parsed = await parseJson(c, apiCallBody);
    if ('error' in parsed) return parsed.response;
    // M1 polish (#2) — check cache before minting. The provider determines
    // the canonical scope-key from its session-creds shape.
    const connection = await loadCloudConnection(deps.db, parsed.value.customer_id, connectionId);
    if (!connection) {
      return jsonResp(404, { error: 'connection_not_found' });
    }
    let provider: CloudProvider;
    try {
      provider = getCloudProvider(deps.registry, connection.connector);
    } catch {
      return jsonResp(501, { error: 'provider_unsupported', connector: connection.connector });
    }
    const probeScope = probeScopeForConnection(connection);
    let creds: CloudSessionCreds | undefined;
    let idTokenJti = '';
    let cacheHit = false;
    if (deps.credsCache) {
      creds = deps.credsCache.get(connectionId, probeScope);
      cacheHit = creds !== undefined;
    }
    if (!creds) {
      const ctx = await resolve(deps, connectionId, parsed.value);
      if ('error' in ctx) return ctx.response;
      idTokenJti = ctx.idToken.jti;
      void audit.publish({
        kind: 'cloud.token.minted',
        customerId: parsed.value.customer_id,
        agentId: parsed.value.agent_id,
        connectionId: ctx.connection.id,
        connector: ctx.connection.connector,
        command: parsed.value.request.url,
        jti: idTokenJti,
      });
      try {
        creds = await ctx.provider.acquireSessionCreds(ctx.connection, ctx.idToken.token);
        void audit.publish({
          kind: 'cloud.federation.exchanged',
          customerId: parsed.value.customer_id,
          agentId: parsed.value.agent_id,
          connectionId: ctx.connection.id,
          connector: ctx.connection.connector,
          command: parsed.value.request.url,
          jti: idTokenJti,
        });
      } catch (err) {
        void audit.publish({
          kind: 'cloud.federation.exchanged.failed',
          customerId: parsed.value.customer_id,
          agentId: parsed.value.agent_id,
          connectionId: ctx.connection.id,
          connector: ctx.connection.connector,
          command: parsed.value.request.url,
          jti: idTokenJti,
          retryable: err instanceof CloudFederationError ? err.retryable : false,
          error: err instanceof Error ? err.message : String(err),
        });
        return federationErrorToResponse(c, err);
      }
      deps.credsCache?.set(connectionId, scopeKey(creds), creds);
    }
    let response: import('@auto-nomos/core').CloudApiResponse;
    try {
      response = await provider.signAndCall(creds, parsed.value.request as CloudApiRequest);
    } catch (err) {
      return federationErrorToResponse(c, err);
    }
    return c.json({
      status: response.status,
      body: response.body,
      headers: response.headers,
      id_token_jti: idTokenJti,
      connector: connection.connector,
      cache_hit: cacheHit,
    });
  });

  return app;
}

interface ResolveOk {
  connection: CloudConnectionRow;
  provider: CloudProvider;
  idToken: { token: string; jti: string };
}

interface ResolveErr {
  error: true;
  response: Response;
}

async function resolve(
  deps: CloudInternalDeps,
  connectionId: string,
  body: { customer_id: string; agent_id: string; intent_id?: string; ucan_cid?: string },
): Promise<ResolveOk | ResolveErr> {
  const connection = await loadCloudConnection(deps.db, body.customer_id, connectionId);
  if (!connection) {
    return { error: true, response: jsonResp(404, { error: 'connection_not_found' }) };
  }
  let provider: CloudProvider;
  try {
    provider = getCloudProvider(deps.registry, connection.connector);
  } catch {
    return {
      error: true,
      response: jsonResp(501, { error: 'provider_unsupported', connector: connection.connector }),
    };
  }
  const audience = provider.audienceFor(connection);
  const idToken = await mintIdToken(deps.signer, deps.issuer, {
    customerId: body.customer_id,
    agentId: body.agent_id,
    audience: audience.audience,
    ttlSeconds: audience.ttlSeconds ?? deps.defaultTtlSeconds,
    ...(body.intent_id ? { intentId: body.intent_id } : {}),
    ...(body.ucan_cid ? { ucanCid: body.ucan_cid } : {}),
  });
  return { connection, provider, idToken: { token: idToken.token, jti: idToken.jti } };
}

async function parseJson<T extends z.ZodTypeAny>(
  c: import('hono').Context,
  schema: T,
): Promise<{ value: z.infer<T> } | { error: true; response: Response }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: true, response: jsonResp(400, { error: 'invalid_json' }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      error: true,
      response: jsonResp(400, { error: 'invalid_body', issues: parsed.error.issues }),
    };
  }
  return { value: parsed.data };
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function federationErrorToResponse(c: import('hono').Context, err: unknown): Response {
  if (err instanceof CloudFederationError) {
    return c.json(
      {
        error: 'cloud_call_failed',
        message: err.message,
        provider_status: err.status,
        provider_body: err.providerBody,
        retryable: err.retryable,
      },
      err.retryable ? 503 : 502,
    );
  }
  throw err;
}

/**
 * Probe scope used to look up the cache before we know the actual scope
 * the provider would compute.
 *
 *   - Azure: fixed AAD scope (management.azure.com/.default).
 *   - AWS: keyed by region. Read from connection.config.region; default
 *     to us-east-1. Mismatch with a customer-overridden scope is benign:
 *     scopeKey(creds) records the actual key on insert.
 *   - GCP: fixed cloud-platform scope.
 */
function probeScopeForConnection(connection: CloudConnectionRow): string {
  switch (connection.connector) {
    case 'azure': {
      const cfg = connection.config as { scope?: unknown };
      return typeof cfg.scope === 'string' ? cfg.scope : 'https://management.azure.com/.default';
    }
    case 'aws': {
      const cfg = connection.config as { region?: unknown };
      return typeof cfg.region === 'string' ? cfg.region : 'us-east-1';
    }
    case 'gcp':
      return 'cloud-platform';
  }
}

function serializeCreds(creds: CloudSessionCreds): Record<string, unknown> {
  const base = { kind: creds.kind, expires_at: creds.expiresAt.toISOString() };
  switch (creds.kind) {
    case 'azure_bearer':
      return { ...base, access_token: creds.accessToken, scope: creds.scope };
    case 'gcp_bearer':
      return { ...base, access_token: creds.accessToken };
    case 'aws_sigv4':
      return {
        ...base,
        access_key_id: creds.accessKeyId,
        secret_access_key: creds.secretAccessKey,
        session_token: creds.sessionToken,
        region: creds.region,
      };
  }
}
