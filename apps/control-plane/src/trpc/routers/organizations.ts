/**
 * Multi-org session surface.
 *
 *   list   — every org the calling user has a membership in, with role.
 *   switch — set the `x-cb-org` cookie that context.ts honours on the next
 *            request to scope `customerId` to a different org.
 *
 * Membership is the source of truth; the cookie only narrows which existing
 * membership the request runs under. Forging the cookie to an org the user
 * doesn't belong to is harmless — context.ts ignores invalid values.
 */
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { protectedProcedure, router } from '../index.js';

export const ORG_COOKIE_NAME = 'x-cb-org';
const COOKIE_MAX_AGE_DAYS = 30;

export const organizationsRouter = router({
  /** Every org the calling user has a membership in. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.drizzle.query.memberships.findMany({
      where: eq(schema.memberships.userId, ctx.user.id),
      with: { customer: true },
    });
    return rows
      .filter((r) => r.customer)
      .map((r) => ({
        customerId: r.customerId,
        slug: r.customer!.slug,
        displayName: r.customer!.displayName,
        role: r.role,
        joinedAt: r.createdAt,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }),

  /**
   * Verify that the calling user has a membership for the target org. The
   * client (dashboard) is responsible for actually setting the
   * `x-cb-org` cookie via document.cookie after this resolves successfully.
   * Cookie is non-HttpOnly on purpose so the SPA can update it without a
   * round trip; the cookie only narrows which existing membership to use,
   * and context.ts re-verifies membership on every request.
   */
  switch: protectedProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.drizzle.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.userId, ctx.user.id),
          eq(schema.memberships.customerId, input.customerId),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'no membership for that org' });
      }
      return {
        customerId: input.customerId,
        role: membership.role,
        cookieName: ORG_COOKIE_NAME,
        maxAgeSeconds: COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
      };
    }),
});
