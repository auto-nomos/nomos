import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import {
  listActiveEnvelopes as listActiveEnvelopesService,
  revokeEnvelope as revokeEnvelopeService,
} from '../../services/envelope-store.js';
import { router, withPermission } from '../index.js';

export const envelopesRouter = router({
  /**
   * List active envelopes for this customer (optionally scoped to one
   * agent). Used by the dashboard "Active grants" panel; revoked /
   * expired rows are filtered out by `listActiveEnvelopes`.
   */
  list: withPermission('envelopes', 'read')
    .input(z.object({ agentId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.agentId) {
        return listActiveEnvelopesService(ctx.db.drizzle, ctx.customerId, input.agentId);
      }
      // No agent filter — pull active envelopes across all agents in the
      // customer. We mirror the service-layer filter (active = not
      // revoked, not expired) inline so we don't need a separate
      // multi-agent helper for one screen.
      const rows = await ctx.db.drizzle.query.envelopes.findMany({
        where: and(eq(schema.envelopes.customerId, ctx.customerId)),
        orderBy: [desc(schema.envelopes.createdAt)],
      });
      const now = Date.now();
      return rows
        .filter(
          (r) => r.revokedAt === null && (r.expiresAt === null || r.expiresAt.getTime() > now),
        )
        .map((r) => ({
          id: r.id,
          customerId: r.customerId,
          agentId: r.agentId,
          constraint: r.constraint,
          actions: r.actions,
          parentUcanCid: r.parentUcanCid,
          createdBy: r.createdBy,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          revokedAt: r.revokedAt,
          isStanding: r.isStanding,
        }));
    }),

  /**
   * Revoke an envelope. PDP push not required — coverage check at next
   * /v1/intent re-prompts because the row is no longer active. Child
   * UCANs minted earlier still respect their own `exp`; if you need
   * those gone immediately, revoke them by cid via ucansRouter.
   */
  revoke: withPermission('envelopes', 'delete')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const revoked = await revokeEnvelopeService(
        ctx.db.drizzle,
        ctx.customerId,
        input.id,
        ctx.session.user.id,
      );
      if (!revoked) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'envelope not found or already revoked',
        });
      }
      return { id: revoked.id, revokedAt: revoked.revokedAt };
    }),
});
