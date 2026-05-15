import { expandRolePermissions, type Role } from '@auto-nomos/rbac';
import { count, eq } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { protectedProcedure, router } from '../index.js';

export const authRouter = router({
  /**
   * Session info for the dashboard top-nav: user identity, active org id,
   * role in the active org, pre-expanded permission bundle, and the list of
   * orgs available for switching. One round-trip on page load.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.drizzle.query.memberships.findMany({
      where: eq(schema.memberships.userId, ctx.user.id),
      with: { customer: true },
    });
    const availableOrgs = memberships
      .filter((m) => m.customer)
      .map((m) => ({
        customerId: m.customerId,
        slug: m.customer!.slug,
        displayName: m.customer!.displayName,
        role: m.role as Role,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    return {
      user: ctx.user,
      activeCustomerId: ctx.customerId,
      activeRole: ctx.membership?.role ?? null,
      permissions: ctx.membership ? expandRolePermissions(ctx.membership.role) : null,
      availableOrgs,
    };
  }),

  /**
   * Returns the calling user's passkey-enrollment state. Consumed by the
   * dashboard `/app` layout to gate routes behind a registered passkey
   * during the grace period.
   */
  passkeyStatus: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db.drizzle
      .select({ passkeyEnrolledAt: schema.user.passkeyEnrolledAt })
      .from(schema.user)
      .where(eq(schema.user.id, ctx.user.id))
      .limit(1);
    const countRows = await ctx.db.drizzle
      .select({ value: count() })
      .from(schema.passkey)
      .where(eq(schema.passkey.userId, ctx.user.id));
    const passkeyCount = Number(countRows[0]?.value ?? 0);
    return {
      passkeyEnrolledAt: row?.passkeyEnrolledAt ?? null,
      passkeyCount,
      enrolled: (row?.passkeyEnrolledAt ?? null) !== null && passkeyCount > 0,
    };
  }),

  /**
   * Marks the user as having completed passkey enrollment. Called by the
   * dashboard right after `authClient.passkey.addPasskey()` succeeds.
   * Idempotent — the timestamp sticks to the first enrollment so later
   * device additions don't bump it.
   */
  markPasskeyEnrolled: protectedProcedure.mutation(async ({ ctx }) => {
    const countRows = await ctx.db.drizzle
      .select({ value: count() })
      .from(schema.passkey)
      .where(eq(schema.passkey.userId, ctx.user.id));
    const passkeyCount = Number(countRows[0]?.value ?? 0);
    if (passkeyCount === 0) {
      return { enrolled: false };
    }
    await ctx.db.drizzle
      .update(schema.user)
      .set({ passkeyEnrolledAt: new Date() })
      .where(eq(schema.user.id, ctx.user.id));
    ctx.logger.info(
      {
        event: 'auth.passkey.enroll',
        userId: ctx.user.id,
        passkeyCount,
      },
      'user marked as passkey-enrolled',
    );
    return { enrolled: true };
  }),
});
