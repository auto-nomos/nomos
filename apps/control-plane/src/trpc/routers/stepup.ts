/**
 * Sprint 9 — step-up approval surface for the dashboard /approve/:id page.
 *
 * Procedures:
 *   getApproval        — load the approval row (must be a member of the customer).
 *   registerOptions    — first-time passkey registration challenge.
 *   registerVerify     — verify + persist new credential.
 *   assertOptions      — biometric step-up assertion challenge.
 *   approve            — verify assertion + mint cosigner UCAN + flip state to approved.
 *   deny               — flip state to denied.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { upsertGrant } from '../../services/grants/upsert.js';
import {
  CosignerError,
  denyApproval,
  mintCosignerForApproval,
} from '../../services/stepup/cosigner.js';
import {
  authenticationOptions,
  registrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from '../../services/stepup/webauthn.js';
import { router, tenantProcedure } from '../index.js';

async function loadApprovalForCustomer(
  ctx: { db: { drizzle: typeof schema extends never ? never : ReturnType<() => unknown> } },
  customerId: string,
  approvalId: string,
) {
  const db = (ctx.db as unknown as { drizzle: import('../../db/index.js').DrizzleClient }).drizzle;
  const [row] = await db
    .select()
    .from(schema.pushApprovals)
    .where(
      and(eq(schema.pushApprovals.id, approvalId), eq(schema.pushApprovals.customerId, customerId)),
    )
    .limit(1);
  return row;
}

// WebAuthn response payloads are validated downstream by @simplewebauthn/server;
// we accept any object shape to avoid coupling the wire to the library's exact
// (and evolving) optional fields.
const RegistrationResponseSchema = z
  .object({ id: z.string(), rawId: z.string(), type: z.literal('public-key') })
  .passthrough();
const AuthenticationResponseSchema = z
  .object({ id: z.string(), rawId: z.string(), type: z.literal('public-key') })
  .passthrough();

export const stepupRouter = router({
  /** All non-expired pending approvals for the current customer (for dashboard widget). */
  listPending: tenantProcedure.query(async ({ ctx }) => {
    const now = new Date();
    return ctx.db.drizzle
      .select({
        id: schema.pushApprovals.id,
        agentId: schema.pushApprovals.agentId,
        agentName: schema.agents.name,
        command: schema.pushApprovals.command,
        resource: schema.pushApprovals.resource,
        expiresAt: schema.pushApprovals.expiresAt,
        requestedAt: schema.pushApprovals.requestedAt,
      })
      .from(schema.pushApprovals)
      .leftJoin(schema.agents, eq(schema.pushApprovals.agentId, schema.agents.id))
      .where(
        and(
          eq(schema.pushApprovals.customerId, ctx.customerId),
          eq(schema.pushApprovals.state, 'pending'),
          gt(schema.pushApprovals.expiresAt, now),
        ),
      )
      .orderBy(desc(schema.pushApprovals.requestedAt))
      .limit(20);
  }),

  /** Returns the latest pending approval for an agent in the current customer. */
  latestForAgent: tenantProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db.drizzle
        .select()
        .from(schema.pushApprovals)
        .where(
          and(
            eq(schema.pushApprovals.customerId, ctx.customerId),
            eq(schema.pushApprovals.agentId, input.agentId),
          ),
        )
        .orderBy(desc(schema.pushApprovals.requestedAt))
        .limit(1);
      return row ?? null;
    }),

  getApproval: tenantProcedure
    .input(z.object({ approvalId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await loadApprovalForCustomer(ctx, ctx.customerId, input.approvalId);
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'approval_not_found' });
      }
      const now = Date.now();
      const effectiveState =
        row.state === 'pending' && row.expiresAt.getTime() <= now ? 'expired' : row.state;
      return { ...row, state: effectiveState };
    }),

  /** List passkeys registered to the current user. */
  listCredentials: tenantProcedure.query(async ({ ctx }) => {
    return ctx.db.drizzle
      .select({
        id: schema.webauthnCredentials.id,
        credentialId: schema.webauthnCredentials.credentialId,
        name: schema.webauthnCredentials.name,
        transports: schema.webauthnCredentials.transports,
        createdAt: schema.webauthnCredentials.createdAt,
        lastUsedAt: schema.webauthnCredentials.lastUsedAt,
      })
      .from(schema.webauthnCredentials)
      .where(eq(schema.webauthnCredentials.userId, ctx.session.user.id))
      .orderBy(desc(schema.webauthnCredentials.createdAt));
  }),

  /** Remove a passkey by uuid; only the owning user may delete. */
  removeCredential: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db.drizzle
        .delete(schema.webauthnCredentials)
        .where(
          and(
            eq(schema.webauthnCredentials.id, input.id),
            eq(schema.webauthnCredentials.userId, ctx.session.user.id),
          ),
        )
        .returning({ id: schema.webauthnCredentials.id });
      if (deleted.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'credential_not_found' });
      }
      return { removed: true };
    }),

  registerOptions: tenantProcedure.mutation(async ({ ctx }) => {
    if (!ctx.webauthn) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'webauthn_disabled' });
    }
    const { options } = await registrationOptions({
      userId: ctx.session.user.id,
      userName: ctx.session.user.email,
      config: ctx.webauthn,
      db: ctx.db.drizzle,
    });
    return options;
  }),

  registerVerify: tenantProcedure
    .input(
      z.object({
        response: RegistrationResponseSchema,
        name: z.string().min(1).max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.webauthn) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'webauthn_disabled' });
      }
      const result = await verifyRegistration({
        userId: ctx.session.user.id,
        // biome-ignore lint/suspicious/noExplicitAny: zod-validated WebAuthn JSON shape.
        response: input.response as any,
        config: ctx.webauthn,
        db: ctx.db.drizzle,
        ...(input.name ? { name: input.name } : {}),
      });
      if (!result.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'registration_verify_failed' });
      }
      return { credentialId: result.credentialId };
    }),

  assertOptions: tenantProcedure
    .input(z.object({ approvalId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.webauthn) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'webauthn_disabled' });
      }
      const row = await loadApprovalForCustomer(ctx, ctx.customerId, input.approvalId);
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'approval_not_found' });
      }
      const { options, hasCredentials } = await authenticationOptions({
        userId: ctx.session.user.id,
        approvalId: input.approvalId,
        config: ctx.webauthn,
        db: ctx.db.drizzle,
      });
      return { options, hasCredentials };
    }),

  approve: tenantProcedure
    .input(
      z.object({
        approvalId: z.string().uuid(),
        response: AuthenticationResponseSchema,
        /** Standing approvals create durable envelopes on /v1/intent
         *  retry. Default 'session' preserves the TTL behavior. Only
         *  meaningful for envelope-class approvals — ignored for
         *  request-class step-ups. */
        mode: z.enum(['session', 'standing']).optional(),
        /** When true, write an active agent_grant so future identical
         *  requests are auto-allowed without prompting. */
        remember: z.boolean().optional(),
        /** Grant scope when remember=true: 'exact' (this resource only)
         *  or 'any' (every resource the action operates on). */
        scope: z.enum(['exact', 'any']).optional(),
        /** Which LLM-drafted cedar variant the operator picked.
         *  When set, that variant's Cedar text persists verbatim into
         *  the grant. Defaults to the approval row's recommended_scope. */
        selectedVariant: z.enum(['narrow', 'medium', 'broad']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.webauthn) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'webauthn_disabled' });
      }
      const auth = await verifyAuthentication({
        userId: ctx.session.user.id,
        approvalId: input.approvalId,
        // biome-ignore lint/suspicious/noExplicitAny: zod-validated WebAuthn JSON shape.
        response: input.response as any,
        config: ctx.webauthn,
        db: ctx.db.drizzle,
      });
      if (!auth.ok) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'webauthn_assert_failed' });
      }
      try {
        const cosigner = await mintCosignerForApproval(
          {
            approvalId: input.approvalId,
            customerId: ctx.customerId,
            decidingUserId: ctx.session.user.id,
            nonce: `cosign-${input.approvalId}-${Date.now()}`,
            ...(input.mode ? { mode: input.mode } : {}),
          },
          {
            db: ctx.db.drizzle,
            signKey: ctx.signing.signKey,
            signerDid: ctx.signing.signerDid,
          },
        );
        if (input.remember) {
          const [approval] = await ctx.db.drizzle
            .select({
              agentId: schema.pushApprovals.agentId,
              agentName: schema.agents.name,
              command: schema.pushApprovals.command,
              resource: schema.pushApprovals.resource,
              riskSummary: schema.pushApprovals.riskSummary,
              cedarVariants: schema.pushApprovals.cedarVariants,
              recommendedScope: schema.pushApprovals.recommendedScope,
            })
            .from(schema.pushApprovals)
            .leftJoin(schema.agents, eq(schema.pushApprovals.agentId, schema.agents.id))
            .where(eq(schema.pushApprovals.id, input.approvalId))
            .limit(1);
          if (approval && approval.agentName) {
            const variantPick =
              input.selectedVariant ??
              (approval.recommendedScope as 'narrow' | 'medium' | 'broad' | null) ??
              null;
            const variants = approval.cedarVariants as Record<string, string> | null;
            const chosenSnippet =
              variantPick && variants && typeof variants[variantPick] === 'string'
                ? variants[variantPick]
                : undefined;
            await upsertGrant(ctx.db.drizzle, {
              customerId: ctx.customerId,
              agentId: approval.agentId,
              agentName: approval.agentName,
              command: approval.command,
              resource: approval.resource as Record<string, unknown>,
              scope: input.scope ?? 'exact',
              decision: 'allow',
              grantedBy: ctx.session.user.id,
              sourceApprovalId: input.approvalId,
              riskSummary: approval.riskSummary,
              ...(chosenSnippet ? { cedarSnippet: chosenSnippet } : {}),
            });
            ctx.policyInvalidator.invalidate(ctx.customerId);
          }
        }
        return {
          approvalId: cosigner.approvalId,
          cosignerJwt: cosigner.cosignerJwt,
          expiresAt: cosigner.expiresAt.toISOString(),
          ...(input.remember ? { remembered: true } : {}),
        };
      } catch (err) {
        if (err instanceof CosignerError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: err.code });
        }
        throw err;
      }
    }),

  deny: tenantProcedure
    .input(
      z.object({
        approvalId: z.string().uuid(),
        /** When true, write a deny grant so future identical requests
         *  are auto-denied without prompting. */
        remember: z.boolean().optional(),
        scope: z.enum(['exact', 'any']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await denyApproval(
        input.approvalId,
        ctx.customerId,
        ctx.session.user.id,
        ctx.db.drizzle,
      );
      if (!result.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'approval_not_pending' });
      }
      if (input.remember) {
        const [approval] = await ctx.db.drizzle
          .select({
            agentId: schema.pushApprovals.agentId,
            agentName: schema.agents.name,
            command: schema.pushApprovals.command,
            resource: schema.pushApprovals.resource,
            riskSummary: schema.pushApprovals.riskSummary,
          })
          .from(schema.pushApprovals)
          .leftJoin(schema.agents, eq(schema.pushApprovals.agentId, schema.agents.id))
          .where(eq(schema.pushApprovals.id, input.approvalId))
          .limit(1);
        if (approval && approval.agentName) {
          await upsertGrant(ctx.db.drizzle, {
            customerId: ctx.customerId,
            agentId: approval.agentId,
            agentName: approval.agentName,
            command: approval.command,
            resource: approval.resource as Record<string, unknown>,
            scope: input.scope ?? 'exact',
            decision: 'deny',
            grantedBy: ctx.session.user.id,
            sourceApprovalId: input.approvalId,
            riskSummary: approval.riskSummary,
          });
          ctx.policyInvalidator.invalidate(ctx.customerId);
        }
        return { ...result, remembered: true };
      }
      return result;
    }),
});
