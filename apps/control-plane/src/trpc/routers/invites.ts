import { createHash, randomBytes } from 'node:crypto';
import { ROLES, type Role } from '@auto-nomos/rbac';
import { TRPCError } from '@trpc/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { publicProcedure, router, withPermission } from '../index.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

const acceptableRoleForInvite = z.enum(
  ROLES.filter((r) => r !== 'owner') as Exclude<Role, 'owner'>[] as [
    Exclude<Role, 'owner'>,
    ...Exclude<Role, 'owner'>[],
  ],
);

export const invitesRouter = router({
  create: withPermission('invites', 'create')
    .input(
      z.object({
        email: z.string().email().max(320),
        role: acceptableRoleForInvite,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.drizzle.query.orgInvites.findFirst({
        where: and(
          eq(schema.orgInvites.customerId, ctx.customerId),
          eq(schema.orgInvites.email, input.email),
          isNull(schema.orgInvites.acceptedAt),
          isNull(schema.orgInvites.revokedAt),
          gt(schema.orgInvites.expiresAt, new Date()),
        ),
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'a pending invite for that email already exists; revoke it first',
        });
      }
      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      const [created] = await ctx.db.drizzle
        .insert(schema.orgInvites)
        .values({
          customerId: ctx.customerId,
          email: input.email,
          role: input.role,
          tokenHash,
          invitedBy: ctx.session.user.id,
          expiresAt,
        })
        .returning();
      if (!created) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'invite insert failed' });
      }

      const customer = await ctx.db.drizzle.query.customers.findFirst({
        where: eq(schema.customers.id, ctx.customerId),
      });
      const orgName = customer?.displayName ?? customer?.name ?? 'your org';

      // Fire-and-forget; failure to send shouldn't roll back the invite row.
      void ctx
        .inviteNotifier({
          email: input.email,
          orgName,
          role: input.role,
          token,
          expiresAt,
          invitedBy: {
            email: ctx.session.user.email,
            name: ctx.session.user.name,
          },
        })
        .catch((err) => {
          ctx.logger.warn(
            { err, inviteId: created.id, email: input.email },
            'invite notifier failed',
          );
        });

      return {
        inviteId: created.id,
        email: created.email,
        role: created.role as Role,
        expiresAt: created.expiresAt,
      };
    }),

  list: withPermission('invites', 'read').query(async ({ ctx }) => {
    const rows = await ctx.db.drizzle.query.orgInvites.findMany({
      where: and(
        eq(schema.orgInvites.customerId, ctx.customerId),
        isNull(schema.orgInvites.acceptedAt),
        isNull(schema.orgInvites.revokedAt),
      ),
    });
    return rows
      .map((r) => ({
        inviteId: r.id,
        email: r.email,
        role: r.role as Role,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        invitedBy: r.invitedBy,
        /** True once past TTL but still un-revoked. The UI uses this to
         *  surface a "resend" affordance. */
        expired: r.expiresAt.getTime() < Date.now(),
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }),

  revoke: withPermission('invites', 'delete')
    .input(z.object({ inviteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.drizzle
        .update(schema.orgInvites)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.orgInvites.id, input.inviteId),
            eq(schema.orgInvites.customerId, ctx.customerId),
            isNull(schema.orgInvites.acceptedAt),
            isNull(schema.orgInvites.revokedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'invite not found or already accepted/revoked',
        });
      }
      return { inviteId: updated.id, revokedAt: updated.revokedAt };
    }),

  /**
   * Accept an invite. Public — the caller may or may not have a session.
   *
   *   * Signed-in + email matches invite → membership created, invite marked
   *     accepted, returns { status: 'joined', customerId, role }.
   *   * Signed-in + email mismatch → returns { status: 'wrong_account', ... }
   *     and refuses to mutate. UI tells the user to sign out + back in.
   *   * Unauthenticated → returns { status: 'needs_signup', email, orgName,
   *     role } so the dashboard can pre-fill the signup form. Token stays
   *     valid until the user finishes signup, at which point they call this
   *     procedure again from the post-signup hook.
   */
  accept: publicProcedure
    .input(z.object({ token: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const tokenHash = hashToken(input.token);
      const invite = await ctx.db.drizzle.query.orgInvites.findFirst({
        where: eq(schema.orgInvites.tokenHash, tokenHash),
      });
      if (!invite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'invite not found' });
      }
      if (invite.acceptedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'invite already accepted' });
      }
      if (invite.revokedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'invite revoked' });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'invite expired' });
      }

      const customer = await ctx.db.drizzle.query.customers.findFirst({
        where: eq(schema.customers.id, invite.customerId),
      });
      const orgName = customer?.displayName ?? customer?.name ?? 'this org';

      if (!ctx.session?.user) {
        return {
          status: 'needs_signup' as const,
          email: invite.email,
          orgName,
          role: invite.role as Role,
        };
      }
      if (ctx.session.user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return {
          status: 'wrong_account' as const,
          inviteEmail: invite.email,
          sessionEmail: ctx.session.user.email,
        };
      }

      const existingMembership = await ctx.db.drizzle.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.userId, ctx.session.user.id),
          eq(schema.memberships.customerId, invite.customerId),
        ),
      });
      if (!existingMembership) {
        await ctx.db.drizzle.insert(schema.memberships).values({
          userId: ctx.session.user.id,
          customerId: invite.customerId,
          role: invite.role as Role,
        });
      }
      await ctx.db.drizzle
        .update(schema.orgInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.orgInvites.id, invite.id));

      // Steer the just-joined user into the invited org on next page render.
      // context.ts reads this after the cookie + before the owner-role
      // fallback, so an admin invited into "Acme" no longer lands in their
      // own auto-created org.
      await ctx.db.drizzle
        .update(schema.user)
        .set({ activeCustomerId: invite.customerId })
        .where(eq(schema.user.id, ctx.session.user.id));

      return {
        status: 'joined' as const,
        customerId: invite.customerId,
        orgName,
        role: invite.role as Role,
      };
    }),
});
