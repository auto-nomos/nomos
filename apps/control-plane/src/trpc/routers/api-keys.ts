import { sha256Hex } from '@credential-broker/crypto';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, tenantProcedure } from '../index.js';

const PREFIX_LEN = 8;
const SECRET_BYTES = 24;

function randomHex(len: number): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateKey(): { prefix: string; plaintext: string; keyHash: string } {
  const prefix = `cb_${randomHex(PREFIX_LEN / 2)}`; // 8 hex chars after prefix
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
  list: tenantProcedure
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
        createdAt: r.createdAt,
        revokedAt: r.revokedAt,
      }));
    }),

  /**
   * Create an API key for an agent. The plaintext token is returned ONCE.
   * Subsequent reads only ever see prefix + metadata.
   */
  create: tenantProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        name: z.string().min(1).max(100),
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

      const { prefix, plaintext, keyHash } = generateKey();
      const [created] = await ctx.db.drizzle
        .insert(schema.apiKeys)
        .values({
          customerId: ctx.customerId,
          agentId: input.agentId,
          keyHash,
          prefix,
          name: input.name,
        })
        .returning();
      if (!created) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'api key insert failed' });
      }
      return {
        id: created.id,
        agentId: created.agentId,
        name: created.name,
        prefix: created.prefix,
        createdAt: created.createdAt,
        plaintextOnce: plaintext,
      };
    }),

  revoke: tenantProcedure
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
