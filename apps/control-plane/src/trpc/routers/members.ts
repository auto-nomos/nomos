import { ROLES, type Role } from '@auto-nomos/rbac';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DrizzleClient } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { router, withPermission } from '../index.js';

const roleSchema = z.enum(ROLES);

async function countOwners(drizzle: DrizzleClient, customerId: string): Promise<number> {
  const rows = await drizzle.query.memberships.findMany({
    where: and(eq(schema.memberships.customerId, customerId), eq(schema.memberships.role, 'owner')),
  });
  return rows.length;
}

export const membersRouter = router({
  /** List every membership in the current org with the user's email + name. */
  list: withPermission('members', 'read').query(async ({ ctx }) => {
    const rows = await ctx.db.drizzle.query.memberships.findMany({
      where: eq(schema.memberships.customerId, ctx.customerId),
      with: { user: true },
    });
    return rows
      .map((r) => ({
        membershipId: r.id,
        userId: r.userId,
        email: r.user?.email ?? '',
        name: r.user?.name ?? null,
        role: r.role as Role,
        joinedAt: r.createdAt,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  }),

  changeRole: withPermission('members', 'update')
    .input(z.object({ membershipId: z.string().uuid(), role: roleSchema }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.drizzle.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.id, input.membershipId),
          eq(schema.memberships.customerId, ctx.customerId),
        ),
      });
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'membership not found' });
      }
      if (target.role === 'owner' && input.role !== 'owner') {
        const owners = await countOwners(ctx.db.drizzle, ctx.customerId);
        if (owners <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'cannot demote the last owner; promote another member first',
          });
        }
      }
      const [updated] = await ctx.db.drizzle
        .update(schema.memberships)
        .set({ role: input.role })
        .where(eq(schema.memberships.id, input.membershipId))
        .returning();
      return {
        membershipId: updated!.id,
        userId: updated!.userId,
        role: updated!.role as Role,
      };
    }),

  remove: withPermission('members', 'delete')
    .input(z.object({ membershipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.drizzle.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.id, input.membershipId),
          eq(schema.memberships.customerId, ctx.customerId),
        ),
      });
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'membership not found' });
      }
      if (target.role === 'owner') {
        const owners = await countOwners(ctx.db.drizzle, ctx.customerId);
        if (owners <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'cannot remove the last owner',
          });
        }
      }
      if (target.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'use auth.signOut to leave an org; this endpoint is for removing others',
        });
      }
      await ctx.db.drizzle
        .delete(schema.memberships)
        .where(eq(schema.memberships.id, input.membershipId));
      return { ok: true as const };
    }),
});
