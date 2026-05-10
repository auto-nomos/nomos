import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { RefreshError, refreshConnection } from '../../services/oauth-refresh.js';
import { router, tenantProcedure } from '../index.js';

export const oauthRouter = router({
  /** List the customer's OAuth connections (no tokens — metadata only).
   *  `hasRefreshToken` lets the dashboard hide the Refresh button when the
   *  provider didn't issue one (GitHub OAuth apps without expiring tokens,
   *  Notion). */
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.drizzle.query.oauthConnections.findMany({
      where: eq(schema.oauthConnections.customerId, ctx.customerId),
      columns: {
        id: true,
        connector: true,
        accountId: true,
        scopesGranted: true,
        encryptedRefreshToken: true,
        accessTokenExpiresAt: true,
        refreshTokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map(({ encryptedRefreshToken, ...rest }) => ({
      ...rest,
      hasRefreshToken: encryptedRefreshToken.length > 0,
    }));
  }),

  /** Drop the connection row. Outstanding UCANs minted against this
   *  connection still expire on their own TTL — this only blocks future
   *  mintUcan calls from picking the connector up. */
  disconnect: tenantProcedure
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.drizzle
        .delete(schema.oauthConnections)
        .where(
          and(
            eq(schema.oauthConnections.id, input.connectionId),
            eq(schema.oauthConnections.customerId, ctx.customerId),
          ),
        )
        .returning({ id: schema.oauthConnections.id });
      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'connection not found' });
      }
      return { ok: true as const };
    }),

  /** Force-refresh the access token via the connector's refresh endpoint.
   *  Returns the new expiry. Useful when a customer suspects a stale
   *  cached token is causing 401s in the wild. */
  refresh: tenantProcedure
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.oauth) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'oauth bridge not configured on this control plane',
        });
      }
      try {
        const stored = await refreshConnection(
          { db: ctx.db.drizzle, encryptionKey: ctx.oauth.encryptionKey, config: ctx.oauth.config },
          ctx.customerId,
          input.connectionId,
        );
        return {
          ok: true as const,
          accessTokenExpiresAt: stored.tokens.accessTokenExpiresAt ?? null,
        };
      } catch (err) {
        if (err instanceof RefreshError) {
          throw new TRPCError({
            code: err.code === 'connection_not_found' ? 'NOT_FOUND' : 'BAD_REQUEST',
            message: err.message,
            cause: err,
          });
        }
        throw err;
      }
    }),
});
