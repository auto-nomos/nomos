import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
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
   * Hash-chain proof for one event. Walks audit_events forward from the
   * queried event up to the most recent signed root for the customer (or the
   * customer's chain head if no root has been signed yet).
   *
   * Output is the canonical `AuditBundle` shape consumed by the
   * @credential-broker/audit-verify CLI.
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

      // Latest signed root that anchors this event. We require root.signedAt
      // >= ev.ts so the root post-dates the event, and root.rootEventId's ts
      // >= ev.ts so it's downstream in the chain.
      const root = await ctx.db.drizzle.query.auditRoots.findFirst({
        where: and(
          eq(schema.auditRoots.customerId, ctx.customerId),
          gte(schema.auditRoots.signedAt, ev.ts),
        ),
        orderBy: [desc(schema.auditRoots.signedAt)],
      });

      let upperBoundTs: Date | undefined;
      let rootEvent: typeof ev | undefined;
      if (root) {
        rootEvent = await ctx.db.drizzle.query.auditEvents.findFirst({
          where: and(
            eq(schema.auditEvents.eventId, root.rootEventId),
            eq(schema.auditEvents.customerId, ctx.customerId),
          ),
        });
        upperBoundTs = rootEvent?.ts;
      }

      const conds = [
        eq(schema.auditEvents.customerId, ctx.customerId),
        gte(schema.auditEvents.ts, ev.ts),
      ];
      if (upperBoundTs !== undefined) {
        conds.push(lte(schema.auditEvents.ts, upperBoundTs));
      }
      const rows = await ctx.db.drizzle.query.auditEvents.findMany({
        where: and(...conds),
        orderBy: [asc(schema.auditEvents.ts), asc(schema.auditEvents.prevHash)],
      });

      // Drop any rows that aren't part of the chain that contains `ev`. With
      // a single PDP per env this is one chain so nothing gets filtered, but
      // multi-PDP fan-out (Phase 2) could interleave so this guards us.
      const chain: typeof rows = [];
      let expectedPrev = ev.prevHash;
      for (const row of rows) {
        if (row.prevHash !== expectedPrev) continue;
        chain.push(row);
        expectedPrev = row.hash;
        if (rootEvent && row.eventId === rootEvent.eventId) break;
      }

      return {
        event_id: ev.eventId,
        events: chain.map((c) => ({
          event_id: c.eventId,
          customer_id: c.customerId,
          prev_hash: c.prevHash,
          hash: c.hash,
          payload: c.payload as Record<string, unknown>,
        })),
        root: root
          ? {
              root_event_id: root.rootEventId,
              root_hash: root.rootHash,
              signing_key_id: root.signingKeyId,
              signature: root.signature,
              signed_at: root.signedAt.toISOString(),
            }
          : null,
      };
    }),
});
