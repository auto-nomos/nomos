import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, withPermission } from '../index.js';

export const customersRouter = router({
  /** Returns the active customer (the one the user has membership in). */
  get: withPermission('org', 'read').query(async ({ ctx }) => {
    const customer = await ctx.db.drizzle.query.customers.findFirst({
      where: eq(schema.customers.id, ctx.customerId),
    });
    if (!customer) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'customer not found' });
    }
    return customer;
  }),

  update: withPermission('org', 'update')
    .input(
      z.object({
        name: z.string().min(1).max(200).optional(),
        displayName: z.string().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<typeof schema.customers.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.displayName !== undefined) updates.displayName = input.displayName;
      const [updated] = await ctx.db.drizzle
        .update(schema.customers)
        .set(updates)
        .where(eq(schema.customers.id, ctx.customerId))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'customer not found' });
      }
      return updated;
    }),
});
