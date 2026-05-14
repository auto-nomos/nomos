import { generateKeypair, privateKeyToHex, sealString } from '@auto-nomos/crypto';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
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
    .input(
      z.object({
        name: z.string().min(1).max(100),
        requireApproval: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { did, privateKey } = generateKeypair();
      // Seal the per-agent Ed25519 signing key with the same XChaCha20-Poly1305
      // key the OAuth bridge uses. Without an oauth.encryptionKey (some test
      // setups), the columns stay null — child UCAN minting then refuses with
      // `agent_no_signing_key`. The legacy single-agent path is unaffected.
      const sealed = ctx.oauth?.encryptionKey
        ? sealString(ctx.oauth.encryptionKey, privateKeyToHex(privateKey))
        : null;
      const now = new Date();
      const [agent] = await ctx.db.drizzle
        .insert(schema.agents)
        .values({
          customerId: ctx.customerId,
          name: input.name,
          did,
          status: 'active',
          ...(sealed
            ? {
                encryptedSigningKey: sealed.ciphertextHex,
                signingKeyNonce: sealed.nonceHex,
              }
            : {}),
          ...(input.requireApproval
            ? {}
            : { connectionApprovedAt: now, connectionApprovedBy: ctx.session.user.id }),
        })
        .returning();
      if (!agent) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'agent insert failed' });
      }
      void ctx.telegramBot
        ?.sendToCustomer(
          ctx.customerId,
          `🤖 *App created*: \`${agent.name}\`\nCreated by: ${ctx.session.user.email}`,
        )
        .catch(() => {});
      return agent;
    }),

  pendingConnections: tenantProcedure.query(async ({ ctx }) => {
    return ctx.db.drizzle.query.agents.findMany({
      where: and(
        eq(schema.agents.customerId, ctx.customerId),
        isNull(schema.agents.connectionApprovedAt),
        eq(schema.agents.status, 'active'),
      ),
      orderBy: [desc(schema.agents.createdAt)],
    });
  }),

  approveConnection: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.drizzle
        .update(schema.agents)
        .set({
          connectionApprovedAt: new Date(),
          connectionApprovedBy: ctx.session.user.id,
        })
        .where(and(eq(schema.agents.id, input.id), eq(schema.agents.customerId, ctx.customerId)))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'agent not found' });
      }
      return updated;
    }),

  denyConnection: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.drizzle
        .update(schema.agents)
        .set({ status: 'disabled' })
        .where(and(eq(schema.agents.id, input.id), eq(schema.agents.customerId, ctx.customerId)))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'agent not found' });
      }
      return updated;
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

  setMode: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        mode: z.enum(['static', 'dynamic']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.drizzle
        .update(schema.agents)
        .set({ mode: input.mode })
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

  listPolicies: tenantProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAgentInCustomer(ctx, input.agentId);
      const rows = await ctx.db.drizzle
        .select({
          mappingId: schema.agentPolicies.id,
          policyId: schema.policies.id,
          name: schema.policies.name,
          integrationId: schema.policies.integrationId,
          source: schema.agentPolicies.source,
          createdAt: schema.agentPolicies.createdAt,
        })
        .from(schema.agentPolicies)
        .innerJoin(schema.policies, eq(schema.agentPolicies.policyId, schema.policies.id))
        .where(
          and(
            eq(schema.agentPolicies.agentId, input.agentId),
            eq(schema.agentPolicies.customerId, ctx.customerId),
          ),
        )
        .orderBy(desc(schema.agentPolicies.createdAt));
      return rows;
    }),

  assignPolicies: tenantProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        policyIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAgentInCustomer(ctx, input.agentId);
      await assertPoliciesInCustomer(ctx, input.policyIds);
      await ctx.db.drizzle
        .insert(schema.agentPolicies)
        .values(
          input.policyIds.map((policyId) => ({
            customerId: ctx.customerId,
            agentId: input.agentId,
            policyId,
            source: 'manual' as const,
            createdBy: ctx.session.user.id,
          })),
        )
        .onConflictDoNothing();
      ctx.policyInvalidator.invalidate(ctx.customerId);
      return { assigned: input.policyIds.length };
    }),

  unassignPolicy: tenantProcedure
    .input(z.object({ agentId: z.string().uuid(), policyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAgentInCustomer(ctx, input.agentId);
      const [removed] = await ctx.db.drizzle
        .delete(schema.agentPolicies)
        .where(
          and(
            eq(schema.agentPolicies.agentId, input.agentId),
            eq(schema.agentPolicies.policyId, input.policyId),
            eq(schema.agentPolicies.customerId, ctx.customerId),
          ),
        )
        .returning({ id: schema.agentPolicies.id });
      if (!removed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'mapping not found' });
      }
      ctx.policyInvalidator.invalidate(ctx.customerId);
      return { removed: true };
    }),
});

async function assertAgentInCustomer(
  ctx: { db: { drizzle: import('../../db/index.js').DrizzleClient }; customerId: string },
  agentId: string,
): Promise<void> {
  const agent = await ctx.db.drizzle.query.agents.findFirst({
    where: and(eq(schema.agents.id, agentId), eq(schema.agents.customerId, ctx.customerId)),
    columns: { id: true },
  });
  if (!agent) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'agent not found' });
  }
}

async function assertPoliciesInCustomer(
  ctx: { db: { drizzle: import('../../db/index.js').DrizzleClient }; customerId: string },
  policyIds: string[],
): Promise<void> {
  const found = await ctx.db.drizzle
    .select({ id: schema.policies.id })
    .from(schema.policies)
    .where(
      and(eq(schema.policies.customerId, ctx.customerId), inArray(schema.policies.id, policyIds)),
    );
  if (found.length !== policyIds.length) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'one or more policies not found' });
  }
}
