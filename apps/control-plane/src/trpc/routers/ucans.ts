import { generateKeypair } from '@credential-broker/crypto';
import { issueUcan } from '@credential-broker/ucan';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, tenantProcedure } from '../index.js';

/**
 * Dev-only signing keypair. Sprint 3.7 introduces `scripts/gen-keys.ts` to
 * persist a stable signing key in env; for now each process generates its own
 * which is fine for local-dev tRPC sanity checks.
 */
let DEV_SIGNING_KEY: ReturnType<typeof generateKeypair> | null = null;
function getDevSigningKey() {
  if (!DEV_SIGNING_KEY) DEV_SIGNING_KEY = generateKeypair();
  return DEV_SIGNING_KEY;
}

const COMMAND_RE = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

export const ucansRouter = router({
  list: tenantProcedure
    .input(z.object({ agentId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const where = input.agentId
        ? and(
            eq(schema.ucanIssues.customerId, ctx.customerId),
            eq(schema.ucanIssues.agentId, input.agentId),
          )
        : eq(schema.ucanIssues.customerId, ctx.customerId);
      return ctx.db.drizzle.query.ucanIssues.findMany({
        where,
        orderBy: [desc(schema.ucanIssues.issuedAt)],
        limit: 200,
      });
    }),

  mint: tenantProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        command: z.string().regex(COMMAND_RE),
        ttlSeconds: z
          .number()
          .int()
          .positive()
          .max(86_400 * 7)
          .default(3_600),
        nonce: z.string().min(1).max(64).default('dev'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agent = await ctx.db.drizzle.query.agents.findFirst({
        where: and(
          eq(schema.agents.id, input.agentId),
          eq(schema.agents.customerId, ctx.customerId),
        ),
      });
      if (!agent || agent.status !== 'active') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'active agent not found' });
      }

      const signingKey = getDevSigningKey();
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: signingKey.did,
        aud: agent.did,
        cmd: input.command,
        pol: [],
        nonce: input.nonce,
        nbf: now - 60,
        exp: now + input.ttlSeconds,
      };
      const ucan = issueUcan({ payload, privateKey: signingKey.privateKey });

      const [issued] = await ctx.db.drizzle
        .insert(schema.ucanIssues)
        .values({
          cid: ucan.cid,
          customerId: ctx.customerId,
          agentId: agent.id,
          payload,
          jwt: ucan.jwt,
          expiresAt: new Date((now + input.ttlSeconds) * 1000),
        })
        .returning();
      if (!issued) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ucan insert failed' });
      }
      return { cid: issued.cid, jwt: ucan.jwt, expiresAt: issued.expiresAt };
    }),

  revoke: tenantProcedure
    .input(z.object({ cid: z.string().min(1), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const issued = await ctx.db.drizzle.query.ucanIssues.findFirst({
        where: and(
          eq(schema.ucanIssues.cid, input.cid),
          eq(schema.ucanIssues.customerId, ctx.customerId),
        ),
      });
      if (!issued) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'ucan not found' });
      }
      const [revoked] = await ctx.db.drizzle
        .insert(schema.revocations)
        .values({
          cid: input.cid,
          customerId: ctx.customerId,
          reason: input.reason ?? null,
          revokedBy: ctx.session.user.id,
        })
        .onConflictDoNothing()
        .returning();
      return { cid: input.cid, revoked: revoked !== undefined };
    }),
});
