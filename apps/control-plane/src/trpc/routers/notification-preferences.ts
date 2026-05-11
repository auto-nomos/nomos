import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { protectedProcedure, router } from '../index.js';

const DEFAULTS = {
  telegramChatId: null as string | null,
  telegramEnabled: false,
  emailEnabled: true,
  webPushEnabled: true,
};

export const notificationPreferencesRouter = router({
  /**
   * Read the calling user's notification preferences. Returns defaults
   * (no Telegram, web push + email on) when no row exists yet.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db.drizzle
      .select()
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, ctx.user.id))
      .limit(1);
    if (!row) {
      return { ...DEFAULTS, userId: ctx.user.id, updatedAt: null as Date | null };
    }
    return {
      userId: row.userId,
      telegramChatId: row.telegramChatId,
      telegramEnabled: row.telegramEnabled,
      emailEnabled: row.emailEnabled,
      webPushEnabled: row.webPushEnabled,
      updatedAt: row.updatedAt,
    };
  }),

  /**
   * Upsert the calling user's preferences. Telegram chat-id format is
   * the user's signed numeric id from the credential-broker bot — we
   * accept any non-empty string so test/dev setups can fake it; real
   * validation happens at Knock workflow time when the channel fires.
   */
  update: protectedProcedure
    .input(
      z.object({
        telegramChatId: z.string().min(1).max(64).nullable().optional(),
        telegramEnabled: z.boolean().optional(),
        emailEnabled: z.boolean().optional(),
        webPushEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const incoming = {
        telegramChatId: input.telegramChatId ?? null,
        telegramEnabled: input.telegramEnabled ?? false,
        emailEnabled: input.emailEnabled ?? true,
        webPushEnabled: input.webPushEnabled ?? true,
      };
      const [existing] = await ctx.db.drizzle
        .select()
        .from(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.userId, ctx.user.id))
        .limit(1);
      if (existing) {
        const [row] = await ctx.db.drizzle
          .update(schema.notificationPreferences)
          .set({ ...incoming, updatedAt: now })
          .where(eq(schema.notificationPreferences.userId, ctx.user.id))
          .returning();
        return row;
      }
      const [row] = await ctx.db.drizzle
        .insert(schema.notificationPreferences)
        .values({ userId: ctx.user.id, ...incoming, updatedAt: now })
        .returning();
      return row;
    }),
});
