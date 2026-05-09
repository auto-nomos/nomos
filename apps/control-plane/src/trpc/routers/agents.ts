import { generateKeypair } from '@credential-broker/crypto';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, tenantProcedure } from '../index.js';

export const agentsRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.db.drizzle.query.agents.findMany({
      where: eq(schema.agents.customerId, ctx.customerId),
      orderBy: [desc(schema.agents.createdAt)],
    });
  }),

  create: tenantProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const { did } = generateKeypair();
      const [agent] = await ctx.db.drizzle
        .insert(schema.agents)
        .values({
          customerId: ctx.customerId,
          name: input.name,
          did,
          status: 'active',
        })
        .returning();
      if (!agent) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'agent insert failed' });
      }
      return agent;
    }),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        status: z.enum(['active', 'disabled']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.drizzle
        .update(schema.agents)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where(and(eq(schema.agents.id, input.id), eq(schema.agents.customerId, ctx.customerId)))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'agent not found' });
      }
      return updated;
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.drizzle
        .update(schema.agents)
        .set({ status: 'deleted' })
        .where(and(eq(schema.agents.id, input.id), eq(schema.agents.customerId, ctx.customerId)))
        .returning({ id: schema.agents.id });
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'agent not found' });
      }

      const issued = await ctx.db.drizzle.query.ucanIssues.findMany({
        where: and(
          eq(schema.ucanIssues.agentId, input.id),
          eq(schema.ucanIssues.customerId, ctx.customerId),
        ),
        columns: { cid: true },
      });
      const cids = issued.map((u) => u.cid);

      if (cids.length > 0) {
        await ctx.db.drizzle
          .insert(schema.revocations)
          .values(
            cids.map((cid) => ({
              cid,
              customerId: ctx.customerId,
              reason: 'agent_deleted',
              revokedBy: ctx.session.user.id,
            })),
          )
          .onConflictDoNothing();

        const pushResults = await Promise.allSettled(
          cids.map((cid) => ctx.revocationPublisher.publish(ctx.customerId, cid)),
        );
        ctx.logger.debug(
          {
            agentId: input.id,
            customerId: ctx.customerId,
            revokedCount: cids.length,
            pushFailures: pushResults.filter((r) => r.status === 'rejected').length,
          },
          'agent delete revoked issued UCANs',
        );
      }

      await ctx.db.drizzle
        .update(schema.apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.apiKeys.agentId, input.id),
            eq(schema.apiKeys.customerId, ctx.customerId),
            isNull(schema.apiKeys.revokedAt),
          ),
        );

      return { id: updated.id, deleted: true, revokedUcans: cids.length };
    }),
});
