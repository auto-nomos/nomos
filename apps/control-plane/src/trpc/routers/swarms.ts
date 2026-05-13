/**
 * Sprint MAOS-B — Swarm View backing API.
 *
 * tRPC procedures for the dashboard's `/swarms` route. Reuses the
 * existing tenancy middleware (every where-clause filters on
 * `customer_id`). Aggregates the agent tree, recent receipts, and
 * scope-containment diff used by the AgentTree + ScopeContainment
 * components.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, tenantProcedure } from '../index.js';

export interface AgentTreeNode {
  id: string;
  name: string;
  did: string;
  depth: number;
  parentAgentId: string | null;
  rootAgentId: string | null;
  swarmId: string | null;
  children: AgentTreeNode[];
}

export const swarmsRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.db.drizzle.query.swarms.findMany({
      where: eq(schema.swarms.customerId, ctx.customerId),
      orderBy: [desc(schema.swarms.createdAt)],
    });
  }),

  /** Return the agent tree (root → children) for a swarm. */
  tree: tenantProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const swarm = await ctx.db.drizzle.query.swarms.findFirst({
      where: and(eq(schema.swarms.id, input.id), eq(schema.swarms.customerId, ctx.customerId)),
    });
    if (!swarm) throw new TRPCError({ code: 'NOT_FOUND', message: 'swarm not found' });
    const agents = await ctx.db.drizzle.query.agents.findMany({
      where: and(eq(schema.agents.customerId, ctx.customerId), eq(schema.agents.swarmId, input.id)),
    });
    const byId = new Map<string, AgentTreeNode>();
    for (const a of agents) {
      byId.set(a.id, {
        id: a.id,
        name: a.name,
        did: a.did,
        depth: a.depth,
        parentAgentId: a.parentAgentId ?? null,
        rootAgentId: a.rootAgentId ?? null,
        swarmId: a.swarmId ?? null,
        children: [],
      });
    }
    const roots: AgentTreeNode[] = [];
    for (const node of byId.values()) {
      const parent = node.parentAgentId ? byId.get(node.parentAgentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return { swarm, roots, totalAgents: agents.length };
  }),

  /** Last `limit` receipts for the swarm (allow / deny / step-up). */
  recentReceipts: tenantProcedure
    .input(
      z.object({ id: z.string().uuid(), limit: z.number().int().min(1).max(500).default(100) }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.drizzle
        .select()
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.customerId, ctx.customerId),
            eq(schema.auditEvents.swarmId, input.id),
          ),
        )
        .orderBy(desc(schema.auditEvents.ts))
        .limit(input.limit);
      return rows;
    }),

  /**
   * Scope containment summary — how each agent's effective scope compares
   * to the root. Computed from the most recent allow receipt per agent.
   * Cheap heuristic; per-receipt detail is in the audit log.
   */
  scopeContainment: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const agents = await ctx.db.drizzle.query.agents.findMany({
        where: and(
          eq(schema.agents.customerId, ctx.customerId),
          eq(schema.agents.swarmId, input.id),
        ),
      });
      if (agents.length === 0) return { agents: [] };
      const agentIds = agents.map((a) => a.id);
      const recent = await ctx.db.drizzle
        .select()
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.customerId, ctx.customerId),
            inArray(
              schema.auditEvents.agent,
              agents.map((a) => a.did),
            ),
          ),
        )
        .orderBy(desc(schema.auditEvents.ts))
        .limit(500);
      const lastByAgent = new Map<string, (typeof recent)[number]>();
      for (const ev of recent) {
        if (!lastByAgent.has(ev.agent)) lastByAgent.set(ev.agent, ev);
      }
      return {
        agents: agents.map((a) => {
          const last = lastByAgent.get(a.did);
          return {
            agentId: a.id,
            name: a.name,
            depth: a.depth,
            lastDecision: last?.decision ?? null,
            lastChainDepth: (last?.chainDepth as number | null) ?? null,
            lastCommand: last?.command ?? null,
            lastTs: last?.ts ?? null,
          };
        }),
        totalAgents: agentIds.length,
      };
    }),

  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        rootAgentId: z.string().uuid(),
        maxDepth: z.number().int().positive().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const root = await ctx.db.drizzle.query.agents.findFirst({
        where: and(
          eq(schema.agents.id, input.rootAgentId),
          eq(schema.agents.customerId, ctx.customerId),
        ),
      });
      if (!root) throw new TRPCError({ code: 'NOT_FOUND', message: 'root agent not found' });
      const [swarm] = await ctx.db.drizzle
        .insert(schema.swarms)
        .values({
          customerId: ctx.customerId,
          name: input.name,
          rootAgentId: input.rootAgentId,
          ...(input.maxDepth !== undefined ? { maxDepth: input.maxDepth } : {}),
        })
        .returning();
      if (!swarm) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'swarm insert failed' });
      }
      // Anchor the root agent: rootAgentId = self, depth = 0, swarmId set.
      await ctx.db.drizzle
        .update(schema.agents)
        .set({ rootAgentId: input.rootAgentId, depth: 0, swarmId: swarm.id })
        .where(eq(schema.agents.id, input.rootAgentId));
      return swarm;
    }),

  /**
   * Attach an existing agent to a swarm as a child of `parentAgentId`. The
   * caller must ensure the child UCAN chain is rooted at the swarm's root
   * — DB attachment is metadata only; PDP enforces UCAN chain validity.
   */
  attachChild: tenantProcedure
    .input(
      z.object({
        swarmId: z.string().uuid(),
        agentId: z.string().uuid(),
        parentAgentId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [swarm, parent, child] = await Promise.all([
        ctx.db.drizzle.query.swarms.findFirst({
          where: and(
            eq(schema.swarms.id, input.swarmId),
            eq(schema.swarms.customerId, ctx.customerId),
          ),
        }),
        ctx.db.drizzle.query.agents.findFirst({
          where: and(
            eq(schema.agents.id, input.parentAgentId),
            eq(schema.agents.customerId, ctx.customerId),
          ),
        }),
        ctx.db.drizzle.query.agents.findFirst({
          where: and(
            eq(schema.agents.id, input.agentId),
            eq(schema.agents.customerId, ctx.customerId),
          ),
        }),
      ]);
      if (!swarm || !parent || !child) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'swarm/parent/child not found' });
      }
      const max = swarm.maxDepth ?? 8;
      const depth = parent.depth + 1;
      if (depth >= max) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `attaching at depth ${depth} exceeds swarm maxDepth=${max}`,
        });
      }
      const [updated] = await ctx.db.drizzle
        .update(schema.agents)
        .set({
          parentAgentId: input.parentAgentId,
          rootAgentId: swarm.rootAgentId ?? input.parentAgentId,
          depth,
          swarmId: input.swarmId,
        })
        .where(eq(schema.agents.id, input.agentId))
        .returning();
      return updated;
    }),
});
