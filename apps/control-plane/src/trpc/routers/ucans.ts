import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { MintError, mintUcan } from '../../services/ucan-mint.js';
import { router, withPermission } from '../index.js';

const COMMAND_RE = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

export const ucansRouter = router({
  list: withPermission('agents', 'read')
    .input(z.object({ agentId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const where = input.agentId
        ? and(
            eq(schema.ucanIssues.customerId, ctx.customerId),
            eq(schema.ucanIssues.agentId, input.agentId),
          )
        : eq(schema.ucanIssues.customerId, ctx.customerId);
      return ctx.db.drizzle.query.ucanIssues.findMany({
        where,
        orderBy: [desc(schema.ucanIssues.issuedAt)],
        limit: 200,
      });
    }),

  mint: withPermission('agents', 'update')
    .input(
      z.object({
        agentId: z.string().uuid(),
        command: z.string().regex(COMMAND_RE),
        policyId: z.string().uuid().optional(),
        oauthConnectionId: z.string().uuid().optional(),
        cloudConnectionId: z.string().uuid().optional(),
        ttlSeconds: z
          .number()
          .int()
          .positive()
          .max(86_400 * 7)
          .default(3_600),
        nonce: z.string().min(1).max(64).default('dev'),
        /**
         * D-5: issuer-vouched stable context (Sprint 7). Stamped into
         * `meta.context_hints` so the PDP can use these values during
         * Cedar evaluation with priority over agent-supplied context.
         */
        contextHints: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await mintUcan(
          {
            customerId: ctx.customerId,
            agentId: input.agentId,
            command: input.command,
            policyId: input.policyId,
            oauthConnectionId: input.oauthConnectionId,
            cloudConnectionId: input.cloudConnectionId,
            ttlSeconds: input.ttlSeconds,
            nonce: input.nonce,
            ...(input.contextHints ? { contextHints: input.contextHints } : {}),
          },
          {
            db: ctx.db.drizzle,
            signKey: ctx.signing.signKey,
            signerDid: ctx.signing.signerDid,
          },
        );
        return { cid: result.cid, jwt: result.jwt, expiresAt: result.expiresAt };
      } catch (err) {
        if (err instanceof MintError) {
          const code: 'NOT_FOUND' | 'FORBIDDEN' | 'PRECONDITION_FAILED' | 'BAD_REQUEST' =
            err.code === 'agent_not_found' ||
            err.code === 'policy_not_found' ||
            err.code === 'oauth_connection_not_found' ||
            err.code === 'cloud_connection_not_found'
              ? 'NOT_FOUND'
              : err.code === 'cloud_connection_not_verified'
                ? 'PRECONDITION_FAILED'
                : err.code === 'connection_kind_conflict'
                  ? 'BAD_REQUEST'
                  : 'FORBIDDEN';
          throw new TRPCError({ code, message: err.message });
        }
        throw err;
      }
    }),

  revoke: withPermission('agents', 'update')
    .input(z.object({ cid: z.string().min(1), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const issued = await ctx.db.drizzle.query.ucanIssues.findFirst({
        where: and(
          eq(schema.ucanIssues.cid, input.cid),
          eq(schema.ucanIssues.customerId, ctx.customerId),
        ),
      });
      if (!issued) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'ucan not found' });
      }
      const [revoked] = await ctx.db.drizzle
        .insert(schema.revocations)
        .values({
          cid: input.cid,
          customerId: ctx.customerId,
          reason: input.reason ?? null,
          revokedBy: ctx.session.user.id,
        })
        .onConflictDoNothing()
        .returning();
      // Sprint 8 — fire push notification to every PDP webhook so the
      // revocation is enforced within ~1s instead of waiting for the polling
      // sweep. Failures are swallowed inside the publisher; the 5s sweep is
      // the fallback.
      if (revoked !== undefined) {
        const result = await ctx.revocationPublisher.publish(ctx.customerId, input.cid);
        ctx.logger.debug(
          { cid: input.cid, customerId: ctx.customerId, ...result },
          'revocation pushed to PDP webhooks',
        );
        void ctx.telegramBot
          ?.sendToCustomer(
            ctx.customerId,
            `🚫 *UCAN revoked* by ${ctx.session.user.email}\nCID: \`${input.cid.slice(0, 24)}...\`${input.reason ? `\nReason: ${input.reason}` : ''}`,
          )
          .catch(() => {});
      }
      return { cid: input.cid, revoked: revoked !== undefined };
    }),
});
