/**
 * POST /v1/mint-ucan — SDK ↔ control-plane.
 *
 * Trades a long-lived API key for short-lived UCANs (one per command). The
 * SDK hits this at startup and on near-expiry; the resulting JWTs are what
 * the SDK presents to the PDP's /v1/proxy/:command. The PDP never sees the
 * API key — uniform UCAN handling, edge-friendly enforcement.
 *
 * One UCAN per command because the existing UCAN payload schema binds a
 * single `cmd` (apps/control-plane/src/services/ucan-mint.ts). Caller
 * passes an array; we mint N times.
 */
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  type ApiKeyAuthVariables,
  apiKeyAuth,
  requirePermission,
} from '../middleware/api-key-auth.js';
import { getLog } from '../middleware/logger.js';
import { MintError, mintUcan } from '../services/ucan-mint.js';
import { QuotaExceededError, type UsageService } from '../services/usage.js';

const COMMAND_RE = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;
const MAX_TTL_SECONDS = 3_600;
const DEFAULT_TTL_SECONDS = 600;

const MintBodySchema = z.object({
  commands: z.array(z.string().regex(COMMAND_RE)).min(1).max(16),
  ttlSeconds: z.number().int().positive().max(MAX_TTL_SECONDS).optional(),
  oauthConnectionId: z.string().uuid().optional(),
  cloudConnectionId: z.string().uuid().optional(),
});

const CLOUD_CONNECTORS = new Set(['azure', 'aws', 'gcp']);

export interface MintUcanRouteDeps {
  db: Db;
  signing: { signKey: Uint8Array; signerDid: string };
  usage: UsageService;
}

export function createMintUcanRoutes(
  deps: MintUcanRouteDeps,
): Hono<{ Variables: ApiKeyAuthVariables }> {
  const app = new Hono<{ Variables: ApiKeyAuthVariables }>();

  app.post(
    '/v1/mint-ucan',
    apiKeyAuth({ db: deps.db }),
    requirePermission('agents', 'update'),
    async (c) => {
      const log = getLog(c);
      const customerId = c.get('customerId');
      const agentId = c.get('agentId');

      try {
        await deps.usage.increment(customerId, 'mint');
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          log.warn(
            { customerId, kind: err.kind, plan: err.snapshot.plan },
            'mint-ucan quota_exceeded',
          );
          return c.json(
            {
              error: 'monthly mint quota reached for this plan',
              error_code: 'quota_exceeded',
              plan: err.snapshot.plan,
              mint_count: err.snapshot.mintCount,
              cap: err.snapshot.cap.mintPerMonth,
            },
            402,
          );
        }
        throw err;
      }

      const raw = await c.req.json().catch(() => null);
      if (!raw) {
        return c.json({ error: 'invalid JSON body', error_code: 'invalid_body' }, 400);
      }
      const parsed = MintBodySchema.safeParse(raw);
      if (!parsed.success) {
        return c.json(
          { error: 'invalid request', error_code: 'invalid_body', issues: parsed.error.issues },
          400,
        );
      }
      const ttlSeconds = parsed.data.ttlSeconds ?? DEFAULT_TTL_SECONDS;

      if (parsed.data.oauthConnectionId && parsed.data.cloudConnectionId) {
        return c.json(
          {
            error: 'oauthConnectionId and cloudConnectionId are mutually exclusive',
            error_code: 'connection_kind_conflict',
          },
          400,
        );
      }

      type ResolvedConnection =
        | { kind: 'oauth'; id: string }
        | { kind: 'cloud'; id: string }
        | { kind: 'none' };

      let connectionResolver: (command: string) => Promise<ResolvedConnection>;

      if (parsed.data.cloudConnectionId) {
        const conn = await deps.db.drizzle.query.cloudConnections.findFirst({
          where: and(
            eq(schema.cloudConnections.id, parsed.data.cloudConnectionId),
            eq(schema.cloudConnections.customerId, customerId),
          ),
        });
        if (!conn) {
          return c.json(
            { error: 'cloud connection not found', error_code: 'cloud_connection_not_found' },
            404,
          );
        }
        if (conn.bootstrapStatus !== 'verified') {
          return c.json(
            {
              error: `cloud connection bootstrap_status=${conn.bootstrapStatus}; run verifyNow first`,
              error_code: 'cloud_connection_not_verified',
            },
            412,
          );
        }
        const fixed = parsed.data.cloudConnectionId;
        connectionResolver = async () => ({ kind: 'cloud', id: fixed });
      } else if (parsed.data.oauthConnectionId) {
        const conn = await deps.db.drizzle.query.oauthConnections.findFirst({
          where: and(
            eq(schema.oauthConnections.id, parsed.data.oauthConnectionId),
            eq(schema.oauthConnections.customerId, customerId),
          ),
        });
        if (!conn) {
          return c.json(
            { error: 'oauth connection not found', error_code: 'oauth_connection_not_found' },
            404,
          );
        }
        const fixed = parsed.data.oauthConnectionId;
        connectionResolver = async () => ({ kind: 'oauth', id: fixed });
      } else {
        // Infer from command's first segment: /azure|/aws|/gcp → cloud,
        // else → oauth. Look up the customer's single connection for the
        // inferred kind+connector.
        const cache = new Map<string, ResolvedConnection | 'ambiguous'>();
        connectionResolver = async (command) => {
          const connectorRaw = command.split('/')[1];
          if (!connectorRaw) return { kind: 'none' };
          const cached = cache.get(connectorRaw);
          if (cached !== undefined) {
            if (cached === 'ambiguous') {
              throw new ConnectorAmbiguous(connectorRaw);
            }
            return cached;
          }
          if (CLOUD_CONNECTORS.has(connectorRaw)) {
            const conns = await deps.db.drizzle.query.cloudConnections.findMany({
              where: and(
                eq(schema.cloudConnections.customerId, customerId),
                // biome-ignore lint/suspicious/noExplicitAny: enum cast for query
                eq(schema.cloudConnections.connector, connectorRaw as any),
              ),
            });
            const verified = conns.filter((c) => c.bootstrapStatus === 'verified');
            if (verified.length === 0) {
              cache.set(connectorRaw, { kind: 'none' });
              return { kind: 'none' };
            }
            if (verified.length > 1) {
              cache.set(connectorRaw, 'ambiguous');
              throw new ConnectorAmbiguous(connectorRaw);
            }
            const resolved: ResolvedConnection = { kind: 'cloud', id: verified[0]!.id };
            cache.set(connectorRaw, resolved);
            return resolved;
          }
          // Cast is safe: the enum check happens by virtue of the query
          // returning zero rows for unknown connectors.
          const conns = await deps.db.drizzle.query.oauthConnections.findMany({
            where: and(
              eq(schema.oauthConnections.customerId, customerId),
              // biome-ignore lint/suspicious/noExplicitAny: enum cast for query
              eq(schema.oauthConnections.connector, connectorRaw as any),
            ),
          });
          if (conns.length === 0) {
            cache.set(connectorRaw, { kind: 'none' });
            return { kind: 'none' };
          }
          if (conns.length > 1) {
            cache.set(connectorRaw, 'ambiguous');
            throw new ConnectorAmbiguous(connectorRaw);
          }
          const resolved: ResolvedConnection = { kind: 'oauth', id: conns[0]!.id };
          cache.set(connectorRaw, resolved);
          return resolved;
        };
      }

      const ucans: Array<{ command: string; jwt: string; cid: string; expiresAt: string }> = [];
      for (const command of parsed.data.commands) {
        let resolved: ResolvedConnection;
        try {
          resolved = await connectionResolver(command);
        } catch (err) {
          if (err instanceof ConnectorAmbiguous) {
            const isCloud = CLOUD_CONNECTORS.has(err.connector);
            return c.json(
              {
                error: `multiple ${isCloud ? 'cloud' : 'oauth'} connections for connector ${err.connector}; pass ${isCloud ? 'cloudConnectionId' : 'oauthConnectionId'} explicitly`,
                error_code: isCloud ? 'cloud_connection_ambiguous' : 'oauth_connection_ambiguous',
                connector: err.connector,
              },
              409,
            );
          }
          throw err;
        }

        try {
          const result = await mintUcan(
            {
              customerId,
              agentId,
              command,
              ...(resolved.kind === 'oauth' ? { oauthConnectionId: resolved.id } : {}),
              ...(resolved.kind === 'cloud' ? { cloudConnectionId: resolved.id } : {}),
              ttlSeconds,
              nonce: `${Date.now()}-${command}`,
            },
            {
              db: deps.db.drizzle,
              signKey: deps.signing.signKey,
              signerDid: deps.signing.signerDid,
            },
          );
          ucans.push({
            command,
            jwt: result.jwt,
            cid: result.cid,
            expiresAt: result.expiresAt.toISOString(),
          });
        } catch (err) {
          if (err instanceof MintError) {
            const status =
              err.code === 'agent_not_found' ||
              err.code === 'oauth_connection_not_found' ||
              err.code === 'cloud_connection_not_found'
                ? 404
                : err.code === 'agent_not_active'
                  ? 403
                  : err.code === 'cloud_connection_not_verified'
                    ? 412
                    : 400;
            return c.json({ error: err.message, error_code: err.code, command }, status);
          }
          throw err;
        }
      }

      log.info({ customerId, agentId, commands: parsed.data.commands.length }, 'mint-ucan');
      return c.json({ ucans });
    },
  );

  return app;
}

class ConnectorAmbiguous extends Error {
  constructor(public readonly connector: string) {
    super(`multiple oauth connections for ${connector}`);
    this.name = 'ConnectorAmbiguous';
  }
}
