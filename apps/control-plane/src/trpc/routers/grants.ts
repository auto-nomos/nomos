/**
 * Agent grants surface — list / revoke / toggle remembered decisions.
 *
 * Grants are written when a step-up approval is resolved with `remember=true`.
 * The bundle service renders them into Cedar at policy-publish time so the
 * PDP enforces them without a separate lookup. Revoking a grant immediately
 * causes the next bundle fetch to drop the rule.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { revokeGrant, upsertGrant } from '../../services/grants/upsert.js';
import { router, withPermission } from '../index.js';

export const grantsRouter = router({
  /** Active (non-revoked) grants for the current customer, optionally filtered to one agent. */
  list: withPermission('grants', 'read')
    .input(z.object({ agentId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const filter = input?.agentId
        ? and(
            eq(schema.agentGrants.customerId, ctx.customerId),
            eq(schema.agentGrants.agentId, input.agentId),
            isNull(schema.agentGrants.revokedAt),
          )
        : and(
            eq(schema.agentGrants.customerId, ctx.customerId),
            isNull(schema.agentGrants.revokedAt),
          );
      return ctx.db.drizzle
        .select({
          id: schema.agentGrants.id,
          agentId: schema.agentGrants.agentId,
          agentName: schema.agents.name,
          command: schema.agentGrants.command,
          resourcePattern: schema.agentGrants.resourcePattern,
          scope: schema.agentGrants.scope,
          decision: schema.agentGrants.decision,
          cedarSnippet: schema.agentGrants.cedarSnippet,
          riskSummary: schema.agentGrants.riskSummary,
          grantedAt: schema.agentGrants.grantedAt,
        })
        .from(schema.agentGrants)
        .leftJoin(schema.agents, eq(schema.agentGrants.agentId, schema.agents.id))
        .where(filter)
        .orderBy(desc(schema.agentGrants.grantedAt));
    }),

  /** Toggle decision allow↔deny by revoking and re-issuing. */
  toggle: withPermission('grants', 'update')
    .input(z.object({ grantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.drizzle
        .select({
          id: schema.agentGrants.id,
          agentId: schema.agentGrants.agentId,
          agentName: schema.agents.name,
          command: schema.agentGrants.command,
          resourcePattern: schema.agentGrants.resourcePattern,
          scope: schema.agentGrants.scope,
          decision: schema.agentGrants.decision,
          riskSummary: schema.agentGrants.riskSummary,
        })
        .from(schema.agentGrants)
        .leftJoin(schema.agents, eq(schema.agentGrants.agentId, schema.agents.id))
        .where(
          and(
            eq(schema.agentGrants.id, input.grantId),
            eq(schema.agentGrants.customerId, ctx.customerId),
            isNull(schema.agentGrants.revokedAt),
          ),
        )
        .limit(1);
      if (!row || !row.agentName) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'grant_not_found' });
      }
      const newDecision = row.decision === 'allow' ? 'deny' : 'allow';
      const result = await upsertGrant(ctx.db.drizzle, {
        customerId: ctx.customerId,
        agentId: row.agentId,
        agentName: row.agentName,
        command: row.command,
        resource: row.resourcePattern as Record<string, unknown>,
        scope: row.scope as 'exact' | 'any',
        decision: newDecision,
        grantedBy: ctx.session.user.id,
        riskSummary: row.riskSummary,
      });
      ctx.policyInvalidator.invalidate(ctx.customerId);
      return { id: result.id, decision: result.decision };
    }),

  revoke: withPermission('grants', 'delete')
    .input(z.object({ grantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await revokeGrant(
        ctx.db.drizzle,
        ctx.customerId,
        input.grantId,
        ctx.session.user.id,
      );
      if (!ok) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'grant_not_found' });
      }
      ctx.policyInvalidator.invalidate(ctx.customerId);
      return { revoked: true };
    }),
});
