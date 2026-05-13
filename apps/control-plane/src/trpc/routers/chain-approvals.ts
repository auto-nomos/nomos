/**
 * Sprint MAOS-B — swarm-scoped step-up approvals.
 *
 * Lets an operator approve "this agent and all current children" in one
 * shot. The list of approved agent ids is materialized at approval time
 * (snapshot) — children forked after the approval require a fresh
 * approval. Never auto-extend.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, tenantProcedure } from '../index.js';

async function descendantsOf(
  ctx: Parameters<typeof tenantProcedure.query>[0] extends (a: infer A) => unknown
    ? A extends { ctx: infer C }
      ? C
      : never
    : never,
  rootAgentId: string,
): Promise<string[]> {
  const all = await ctx.db.drizzle.query.agents.findMany({
    where: eq(schema.agents.customerId, ctx.customerId),
  });
  const childrenOf = new Map<string, string[]>();
  for (const a of all) {
    if (a.parentAgentId) {
      const arr = childrenOf.get(a.parentAgentId) ?? [];
      arr.push(a.id);
      childrenOf.set(a.parentAgentId, arr);
    }
  }
  const out: string[] = [];
  const queue: string[] = [rootAgentId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    out.push(id);
    for (const child of childrenOf.get(id) ?? []) queue.push(child);
  }
  return out;
}

export const chainApprovalsRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.db.drizzle.query.agentChainApprovals.findMany({
      where: and(
        eq(schema.agentChainApprovals.customerId, ctx.customerId),
        gte(schema.agentChainApprovals.expiresAt, new Date()),
      ),
    });
  }),

  /**
   * Snapshot the chain rooted at `rootAgentId`, materialize the agent ids
   * into approved_agent_ids, and persist. The dashboard approval page
   * shows these ids inline so the human sees the snapshot before they
   * click Approve.
   */
  create: tenantProcedure
    .input(
      z.object({
        rootAgentId: z.string().uuid(),
        swarmId: z.string().uuid().optional(),
        scope: z.record(z.string(), z.unknown()),
        ttlSeconds: z
          .number()
          .int()
          .min(60)
          .max(60 * 60 * 24 * 30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const root = await ctx.db.drizzle.query.agents.findFirst({
        where: and(
          eq(schema.agents.id, input.rootAgentId),
          eq(schema.agents.customerId, ctx.customerId),
        ),
      });
      if (!root) throw new TRPCError({ code: 'NOT_FOUND', message: 'agent not found' });
      const approvedIds = await descendantsOf(ctx, input.rootAgentId);
      const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
      const [row] = await ctx.db.drizzle
        .insert(schema.agentChainApprovals)
        .values({
          customerId: ctx.customerId,
          rootAgentId: input.rootAgentId,
          ...(input.swarmId !== undefined ? { swarmId: input.swarmId } : {}),
          scope: input.scope,
          approvedAgentIds: approvedIds,
          approverEmail: ctx.session.user.email,
          expiresAt,
          appliesToCurrentChildrenOnly: true,
        })
        .returning();
      return row;
    }),

  /**
   * Snapshot preview: what agents *would* be covered if the user approves
   * for the chain right now. Shown inline on the approve page.
   */
  preview: tenantProcedure
    .input(z.object({ rootAgentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const ids = await descendantsOf(ctx, input.rootAgentId);
      const agents = await ctx.db.drizzle.query.agents.findMany({
        where: eq(schema.agents.customerId, ctx.customerId),
      });
      return {
        agents: agents
          .filter((a) => ids.includes(a.id))
          .map((a) => ({ id: a.id, name: a.name, depth: a.depth })),
        snapshotAt: new Date(),
      };
    }),
});
