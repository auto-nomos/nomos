import { parsePolicy } from '@credential-broker/cedar';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, tenantProcedure } from '../index.js';

export const policiesRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.db.drizzle.query.policies.findMany({
      where: eq(schema.policies.customerId, ctx.customerId),
      orderBy: [desc(schema.policies.updatedAt)],
    });
  }),

  get: tenantProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const policy = await ctx.db.drizzle.query.policies.findFirst({
      where: and(eq(schema.policies.id, input.id), eq(schema.policies.customerId, ctx.customerId)),
    });
    if (!policy) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'policy not found' });
    }
    return policy;
  }),

  upsert: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        cedarText: z.string().min(1),
        integrationId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate Cedar text before persisting — never store unparseable policy.
      const parseResult = parsePolicy(input.cedarText);
      if (!parseResult.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `cedar parse errors: ${parseResult.errors.join('; ')}`,
        });
      }

      if (input.id) {
        const [updated] = await ctx.db.drizzle
          .update(schema.policies)
          .set({
            name: input.name,
            cedarText: input.cedarText,
            ...(input.integrationId !== undefined ? { integrationId: input.integrationId } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(eq(schema.policies.id, input.id), eq(schema.policies.customerId, ctx.customerId)),
          )
          .returning();
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'policy not found' });
        }
        return updated;
      }

      const [created] = await ctx.db.drizzle
        .insert(schema.policies)
        .values({
          customerId: ctx.customerId,
          name: input.name,
          cedarText: input.cedarText,
          ...(input.integrationId !== undefined ? { integrationId: input.integrationId } : {}),
        })
        .returning();
      if (!created) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'policy insert failed' });
      }
      return created;
    }),

  /** Dry-run Cedar parse against arbitrary text without persisting. */
  preview: tenantProcedure.input(z.object({ cedarText: z.string().min(1) })).query(({ input }) => {
    const result = parsePolicy(input.cedarText);
    return { ok: result.ok, errors: result.errors };
  }),
});
