import { parsePolicy } from '@credential-broker/cedar';
import { decide } from '@credential-broker/core';
import { parseToIr } from '@credential-broker/policy-builder';
import { issueUcan } from '@credential-broker/ucan';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, tenantProcedure } from '../index.js';

const COMMAND_RE = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

export const policiesRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.db.drizzle.query.policies.findMany({
      where: eq(schema.policies.customerId, ctx.customerId),
      orderBy: [desc(schema.policies.updatedAt)],
    });
  }),

  get: tenantProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const policy = await ctx.db.drizzle.query.policies.findFirst({
      where: and(eq(schema.policies.id, input.id), eq(schema.policies.customerId, ctx.customerId)),
    });
    if (!policy) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'policy not found' });
    }
    return policy;
  }),

  upsert: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        cedarText: z.string().min(1),
        integrationId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate Cedar text before persisting — never store unparseable policy.
      const parseResult = parsePolicy(input.cedarText);
      if (!parseResult.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `cedar parse errors: ${parseResult.errors.join('; ')}`,
        });
      }

      if (input.id) {
        const [updated] = await ctx.db.drizzle
          .update(schema.policies)
          .set({
            name: input.name,
            cedarText: input.cedarText,
            ...(input.integrationId !== undefined ? { integrationId: input.integrationId } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(eq(schema.policies.id, input.id), eq(schema.policies.customerId, ctx.customerId)),
          )
          .returning();
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'policy not found' });
        }
        return updated;
      }

      const [created] = await ctx.db.drizzle
        .insert(schema.policies)
        .values({
          customerId: ctx.customerId,
          name: input.name,
          cedarText: input.cedarText,
          ...(input.integrationId !== undefined ? { integrationId: input.integrationId } : {}),
        })
        .returning();
      if (!created) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'policy insert failed' });
      }
      return created;
    }),

  /** Dry-run Cedar parse against arbitrary text without persisting. */
  preview: tenantProcedure.input(z.object({ cedarText: z.string().min(1) })).query(({ input }) => {
    const result = parsePolicy(input.cedarText);
    return { ok: result.ok, errors: result.errors };
  }),

  /**
   * Cedar text → visual builder IR. Runs server-side because the parser
   * is the Node-only cedar-wasm binding; the dashboard's Visual tab calls
   * this on every Cedar edit (debounced).
   */
  parseToIr: tenantProcedure
    .input(z.object({ cedarText: z.string().min(1) }))
    .query(({ input }) => parseToIr(input.cedarText)),

  /**
   * Evaluate a saved policy against a synthetic authorize request without
   * persisting anything. The dashboard's Test panel calls this; nothing
   * else should. The Cedar evaluation runs against ONLY this policy's
   * text — other policies in the customer's bundle are ignored, so the
   * panel reflects what THIS policy decides in isolation.
   */
  dryRun: tenantProcedure
    .input(
      z.object({
        policyId: z.string().uuid(),
        command: z.string().regex(COMMAND_RE),
        resource: z.record(z.string(), z.unknown()),
        context: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const policy = await ctx.db.drizzle.query.policies.findFirst({
        where: and(
          eq(schema.policies.id, input.policyId),
          eq(schema.policies.customerId, ctx.customerId),
        ),
      });
      if (!policy) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'policy not found' });
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const synthetic = issueUcan({
        payload: {
          iss: ctx.signing.signerDid,
          aud: 'did:key:dryrun',
          cmd: input.command,
          pol: [],
          nonce: `dryrun-${Date.now()}`,
          nbf: nowSec - 60,
          exp: nowSec + 60,
        },
        privateKey: ctx.signing.signKey,
      });
      const decision = decide({
        ucan: synthetic.jwt,
        request: {
          ucan: synthetic.jwt,
          command: input.command,
          resource: input.resource,
          context: input.context,
        },
        policies: policy.cedarText,
        trustedIssuerDid: ctx.signing.signerDid,
      });
      return {
        allow: decision.allow,
        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
        receiptId: decision.receiptId,
        cedarText: policy.cedarText,
      };
    }),
});
