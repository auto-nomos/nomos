import { sha256Hex } from '@auto-nomos/crypto';
import { ROLES, type Role } from '@auto-nomos/rbac';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, withPermission } from '../index.js';

const SECRET_BYTES = 24;

function randomHex(len: number): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateKey(customerId: string): { prefix: string; plaintext: string; keyHash: string } {
  const prefix = `cb_${customerId}`;
  const secret = randomHex(SECRET_BYTES);
  const plaintext = `${prefix}_${secret}`;
  const keyHash = sha256Hex(plaintext);
  return { prefix, plaintext, keyHash };
}

export const apiKeysRouter = router({
  /**
   * List API keys for the active customer (optionally scoped to one agent).
   * `keyHash` is never returned; only the prefix + name + createdAt + revokedAt.
   */
  list: withPermission('api_keys', 'read')
    .input(z.object({ agentId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const where = input.agentId
        ? and(
            eq(schema.apiKeys.customerId, ctx.customerId),
            eq(schema.apiKeys.agentId, input.agentId),
          )
        : eq(schema.apiKeys.customerId, ctx.customerId);
      const rows = await ctx.db.drizzle.query.apiKeys.findMany({
        where,
        orderBy: [desc(schema.apiKeys.createdAt)],
      });
      return rows.map((r) => ({
        id: r.id,
        agentId: r.agentId,
        name: r.name,
        prefix: r.prefix,
        role: r.role as Role,
        createdAt: r.createdAt,
        revokedAt: r.revokedAt,
        lastUsedAt: r.lastUsedAt,
        lastUserAgent: r.lastUserAgent,
        lastHost: r.lastHost,
      }));
    }),

  /**
   * Create an API key for an agent. The plaintext token is returned ONCE.
   * Subsequent reads only ever see prefix + metadata.
   */
  create: withPermission('api_keys', 'create')
    .input(
      z.object({
        agentId: z.string().uuid(),
        name: z.string().min(1).max(100),
        /** Role bound to this key. Defaults to 'admin' for back-compat with
         *  callers that don't yet pass a role. Owner/admin sessions can mint
         *  any role; the matrix gate on the parent withPermission already
         *  ensured ctx.role has api_keys:create. */
        role: z.enum(ROLES).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agent = await ctx.db.drizzle.query.agents.findFirst({
        where: and(
          eq(schema.agents.id, input.agentId),
          eq(schema.agents.customerId, ctx.customerId),
        ),
      });
      if (!agent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'agent not found' });
      }

      const { prefix, plaintext, keyHash } = generateKey(ctx.customerId);
      const [created] = await ctx.db.drizzle
        .insert(schema.apiKeys)
        .values({
          customerId: ctx.customerId,
          agentId: input.agentId,
          keyHash,
          prefix,
          name: input.name,
          ...(input.role ? { role: input.role } : {}),
        })
        .returning();
      if (!created) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'api key insert failed' });
      }
      void ctx.telegramBot
        ?.sendToCustomer(
          ctx.customerId,
          `🔑 *API key issued*: \`${created.name}\` for app \`${agent.name}\`\nKey prefix: \`${created.prefix.slice(0, 20)}...\``,
        )
        .catch(() => {});
      return {
        id: created.id,
        agentId: created.agentId,
        name: created.name,
        prefix: created.prefix,
        role: created.role as Role,
        createdAt: created.createdAt,
        plaintextOnce: plaintext,
      };
    }),

  revoke: withPermission('api_keys', 'delete')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [revoked] = await ctx.db.drizzle
        .update(schema.apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.apiKeys.id, input.id),
            eq(schema.apiKeys.customerId, ctx.customerId),
            isNull(schema.apiKeys.revokedAt),
          ),
        )
        .returning({ id: schema.apiKeys.id, revokedAt: schema.apiKeys.revokedAt });
      if (!revoked) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'api key not found or already revoked' });
      }
      return { id: revoked.id, revokedAt: revoked.revokedAt };
    }),
});
