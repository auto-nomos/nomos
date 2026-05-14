/**
 * POST /v1/mint-child-ucan — Sprint MAOS-A.2.
 *
 * Caller: a parent agent authenticated by API key. Trades its current
 * delegation chain plus a child agent id for a new child UCAN whose
 * `iss == parentAgent.did` (signed with the parent agent's per-agent
 * Ed25519 key sealed at registration). Response is the new child JWT
 * *and* the full chain (root → … → newChild) so callers can stash it
 * straight into NOMOS_PARENT_UCAN_CHAIN for the spawned subprocess.
 *
 * Quota: counted as a 'mint' against the customer's monthly cap, same
 * as /v1/mint-ucan.
 */

import { ResourceConstraint } from '@auto-nomos/shared-types';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { type ApiKeyAuthVariables, apiKeyAuth } from '../middleware/api-key-auth.js';
import { getLog } from '../middleware/logger.js';
import { MintChildError, mintChildUcan } from '../services/ucan-mint-child.js';
import { QuotaExceededError, type UsageService } from '../services/usage.js';

const COMMAND_RE = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;
const MAX_TTL_SECONDS = 3_600;
const DEFAULT_TTL_SECONDS = 600;

const MintChildBodySchema = z.object({
  parentChain: z.array(z.string()).min(1).max(32),
  childAgentId: z.string().uuid(),
  command: z.string().regex(COMMAND_RE),
  ttlSeconds: z.number().int().positive().max(MAX_TTL_SECONDS).optional(),
  resourceConstraint: ResourceConstraint.optional(),
  oauthConnectionId: z.string().uuid().optional(),
});

export interface MintChildUcanRouteDeps {
  db: Db;
  encryptionKey: Uint8Array;
  usage: UsageService;
  /** Hard cap on chain depth. Defaults to 8 to match PDP NOMOS_MAX_CHAIN_DEPTH. */
  maxChainDepth?: number;
}

export function createMintChildUcanRoutes(
  deps: MintChildUcanRouteDeps,
): Hono<{ Variables: ApiKeyAuthVariables }> {
  const app = new Hono<{ Variables: ApiKeyAuthVariables }>();

  app.post('/v1/mint-child-ucan', apiKeyAuth({ db: deps.db }), async (c) => {
    const log = getLog(c);
    const customerId = c.get('customerId');
    const parentAgentId = c.get('agentId');

    try {
      await deps.usage.increment(customerId, 'mint');
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        log.warn(
          { customerId, kind: err.kind, plan: err.snapshot.plan },
          'mint-child-ucan quota_exceeded',
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
    const parsed = MintChildBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: 'invalid request', error_code: 'invalid_body', issues: parsed.error.issues },
        400,
      );
    }
    const ttlSeconds = parsed.data.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    try {
      const result = await mintChildUcan(
        {
          customerId,
          parentAgentId,
          parentChain: parsed.data.parentChain,
          childAgentId: parsed.data.childAgentId,
          command: parsed.data.command,
          ttlSeconds,
          nonce: `${Date.now()}-${parsed.data.command}-${parentAgentId.slice(0, 6)}`,
          ...(parsed.data.resourceConstraint
            ? { resourceConstraint: parsed.data.resourceConstraint }
            : {}),
          ...(parsed.data.oauthConnectionId
            ? { oauthConnectionId: parsed.data.oauthConnectionId }
            : {}),
        },
        {
          db: deps.db.drizzle,
          encryptionKey: deps.encryptionKey,
          maxChainDepth: deps.maxChainDepth ?? 8,
        },
      );
      log.info(
        {
          customerId,
          parentAgentId,
          childAgentId: parsed.data.childAgentId,
          newDepth: result.newChain.length,
        },
        'mint-child-ucan',
      );
      return c.json({
        jwt: result.jwt,
        cid: result.cid,
        expiresAt: result.expiresAt.toISOString(),
        chain: result.newChain,
      });
    } catch (err) {
      if (err instanceof MintChildError) {
        const status =
          err.code === 'parent_agent_not_found' || err.code === 'child_agent_not_found'
            ? 404
            : err.code === 'agent_no_signing_key'
              ? 409
              : err.code === 'parent_chain_too_deep'
                ? 422
                : 400;
        return c.json({ error: err.message, error_code: err.code }, status);
      }
      throw err;
    }
  });

  return app;
}
