import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { saveConnection } from '../../oauth/tokens.js';
import { RefreshError, refreshConnection } from '../../services/oauth-refresh.js';
import { router, withPermission } from '../index.js';

const ALL_CONNECTOR_IDS = [
  'github',
  'slack',
  'google',
  'notion',
  'salesforce',
  'linear',
  'stripe',
  'jira',
  'google_calendar',
  'postgres',
  'google_gmail',
  'google_drive',
  'google_contacts',
  'discord',
  'telegram',
  'dropbox',
  'twilio',
  'granola',
  'perplexity',
  'imessage',
] as const;

export const oauthRouter = router({
  /** List the customer's OAuth connections (no tokens — metadata only).
   *  `hasRefreshToken` lets the dashboard hide the Refresh button when the
   *  provider didn't issue one (GitHub OAuth apps without expiring tokens,
   *  Notion). */
  list: withPermission('oauth', 'read').query(async ({ ctx }) => {
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
  disconnect: withPermission('oauth', 'delete')
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
  refresh: withPermission('oauth', 'update')
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

  /** M9 — manual token paste. Caller already obtained an OAuth access
   *  token (e.g. GitHub PAT, Slack legacy token, Notion integration secret)
   *  out of band; we just encrypt + persist. No upstream call. Useful when
   *  the OAuth click-through is blocked (corp SSO interstitials, etc.) or
   *  for API-key style integrations (Granola, Perplexity, Twilio). */
  addManual: withPermission('oauth', 'create')
    .input(
      z.object({
        connector: z.enum(ALL_CONNECTOR_IDS),
        accountId: z.string().min(1).max(120),
        accessToken: z.string().min(1).max(8192),
        refreshToken: z.string().max(8192).optional(),
        scopes: z.array(z.string()).default([]),
        accessTokenExpiresAt: z.string().datetime().optional(),
        refreshTokenExpiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.oauth) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'oauth bridge not configured on this control plane',
        });
      }
      const stored = await saveConnection(
        { db: ctx.db.drizzle, encryptionKey: ctx.oauth.encryptionKey },
        {
          customerId: ctx.customerId,
          connector: input.connector,
          tokens: {
            accessToken: input.accessToken,
            refreshToken: input.refreshToken ?? '',
            accessTokenExpiresAt: input.accessTokenExpiresAt
              ? new Date(input.accessTokenExpiresAt)
              : null,
            refreshTokenExpiresAt: input.refreshTokenExpiresAt
              ? new Date(input.refreshTokenExpiresAt)
              : null,
            scopesGranted: input.scopes,
            accountId: input.accountId,
          },
        },
      );
      return {
        id: stored.id,
        connector: stored.connector,
        accountId: stored.accountId,
        scopesGranted: stored.tokens.scopesGranted,
        createdAt: stored.createdAt,
      };
    }),
});
