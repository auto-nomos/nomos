import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, tenantProcedure } from '../index.js';

const DECISION = z.enum(['allow', 'deny', 'stepup']);

export const auditRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        agent: z.string().optional(),
        command: z.string().optional(),
        decision: DECISION.optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.number().int().positive().max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(schema.auditEvents.customerId, ctx.customerId)];
      if (input.agent) conds.push(eq(schema.auditEvents.agent, input.agent));
      if (input.command) conds.push(eq(schema.auditEvents.command, input.command));
      if (input.decision) conds.push(eq(schema.auditEvents.decision, input.decision));
      if (input.from) conds.push(gte(schema.auditEvents.ts, input.from));
      if (input.to) conds.push(lte(schema.auditEvents.ts, input.to));
      const rows = await ctx.db.drizzle.query.auditEvents.findMany({
        where: and(...conds),
        orderBy: [desc(schema.auditEvents.ts)],
        limit: input.limit,
      });
      return rows;
    }),

  /**
   * Returns a hash-chain proof rooting `eventId` back to the most recent signed
   * audit root. Sprint 8 adds the signed-root machinery; for Sprint 3 we just
   * confirm the event belongs to the caller's customer and return the row's
   * own (prevHash, hash) so consumers can wire up the API contract early.
   */
  proof: tenantProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const ev = await ctx.db.drizzle.query.auditEvents.findFirst({
        where: and(
          eq(schema.auditEvents.eventId, input.eventId),
          eq(schema.auditEvents.customerId, ctx.customerId),
        ),
      });
      if (!ev) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'audit event not found' });
      }
      return {
        eventId: ev.eventId,
        prevHash: ev.prevHash,
        hash: ev.hash,
        chain: [{ prevHash: ev.prevHash, hash: ev.hash, payload: ev.payload }],
        signedRoot: null as null | { hash: string; signature: string; signedAt: string },
        note: 'full proof chain lands in Sprint 8',
      };
    }),
});
