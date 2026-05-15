/**
 * Cloud-connections tRPC router — dashboard-facing CRUD for the
 * cloud_connections table.
 *
 *   list:        all connections for the calling tenant
 *   get:         one connection
 *   create:      register a new federation binding after Terraform apply
 *   update:      edit display name / config
 *   disconnect:  drop the row (federation no longer trusts that subject)
 *   verify:      try a cheap federated call → flip bootstrap_status
 *
 * UCAN-mint paths read this table when the policy references
 * meta.cloud_connection_id. UCANs minted against a connection still
 * carry the binding until expiry — disconnect doesn't retroactively
 * invalidate live tokens (use revoke for that).
 */
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, withPermission } from '../index.js';

const cloudConnectorId = z.enum(['azure', 'aws', 'gcp']);

const createInput = z.object({
  connector: cloudConnectorId,
  accountId: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  externalId: z.string().min(1),
  displayName: z.string().min(1).max(64).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

const updateInput = z.object({
  connectionId: z.string().uuid(),
  displayName: z.string().min(1).max(64).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const cloudConnectionsRouter = router({
  list: withPermission('cloud_connections', 'read').query(async ({ ctx }) => {
    const rows = await ctx.db.drizzle.query.cloudConnections.findMany({
      where: eq(schema.cloudConnections.customerId, ctx.customerId),
      columns: {
        id: true,
        connector: true,
        accountId: true,
        tenantId: true,
        externalId: true,
        displayName: true,
        config: true,
        bootstrapStatus: true,
        lastVerifiedAt: true,
        lastVerifyError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows;
  }),

  get: withPermission('cloud_connections', 'read')
    .input(z.object({ connectionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db.drizzle
        .select()
        .from(schema.cloudConnections)
        .where(
          and(
            eq(schema.cloudConnections.id, input.connectionId),
            eq(schema.cloudConnections.customerId, ctx.customerId),
          ),
        )
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'cloud connection not found' });
      }
      return row;
    }),

  create: withPermission('cloud_connections', 'create')
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      if (input.connector === 'azure' && !input.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'tenantId is required for Azure connections',
        });
      }
      const [row] = await ctx.db.drizzle
        .insert(schema.cloudConnections)
        .values({
          customerId: ctx.customerId,
          connector: input.connector,
          accountId: input.accountId,
          tenantId: input.tenantId ?? null,
          externalId: input.externalId,
          displayName: input.displayName ?? null,
          config: input.config,
          bootstrapStatus: 'pending',
        })
        .returning();
      return row;
    }),

  update: withPermission('cloud_connections', 'update')
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      const patch: Partial<typeof schema.cloudConnections.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.displayName !== undefined) patch.displayName = input.displayName;
      if (input.config !== undefined) patch.config = input.config;
      const [row] = await ctx.db.drizzle
        .update(schema.cloudConnections)
        .set(patch)
        .where(
          and(
            eq(schema.cloudConnections.id, input.connectionId),
            eq(schema.cloudConnections.customerId, ctx.customerId),
          ),
        )
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'cloud connection not found' });
      }
      return row;
    }),

  disconnect: withPermission('cloud_connections', 'delete')
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.drizzle
        .delete(schema.cloudConnections)
        .where(
          and(
            eq(schema.cloudConnections.id, input.connectionId),
            eq(schema.cloudConnections.customerId, ctx.customerId),
          ),
        )
        .returning({ id: schema.cloudConnections.id });
      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'cloud connection not found' });
      }
      // Drop every cached session-creds entry so the next call after
      // disconnect can't fish a still-valid 15min-cached token out of memory.
      ctx.credsCache?.delete(input.connectionId);
      return { ok: true as const };
    }),

  /**
   * On-demand "verify now" — runs the same federation handshake as the
   * 24h verify-poll worker, but for one connection synchronously.
   * Dashboard calls this from the cloud detail page button.
   */
  verifyNow: withPermission('cloud_connections', 'update')
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.cloudVerifyPoll) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'cloud verify-poll worker unavailable (OIDC issuer not configured)',
        });
      }
      const result = await ctx.cloudVerifyPoll.verifyOne(input.connectionId, ctx.customerId);
      if (result.status === 'broken' && result.error === 'connection_not_found') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'cloud connection not found' });
      }
      return result;
    }),

  /**
   * Stamp a verify attempt result. Legacy entry-point used by smoke scripts
   * + ad-hoc operator flows. Prefer `verifyNow` which exercises the real
   * federation handshake.
   */
  recordVerify: withPermission('cloud_connections', 'update')
    .input(
      z.object({
        connectionId: z.string().uuid(),
        status: z.enum(['verified', 'broken']),
        error: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.drizzle
        .update(schema.cloudConnections)
        .set({
          bootstrapStatus: input.status,
          lastVerifiedAt: new Date(),
          lastVerifyError: input.status === 'broken' ? (input.error ?? 'unknown') : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.cloudConnections.id, input.connectionId),
            eq(schema.cloudConnections.customerId, ctx.customerId),
          ),
        )
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'cloud connection not found' });
      }
      return row;
    }),
});
