/**
 * Step-up approval surface for the dashboard /approve/:id page.
 *
 * Procedures:
 *   getApproval        — load the approval row (must be a member of the customer).
 *   assertOptions      — biometric step-up assertion challenge.
 *   approve            — verify assertion + mint cosigner UCAN + flip state to approved.
 *   deny               — flip state to denied.
 *
 * Passkey enrollment is now owned by Better-Auth's passkey plugin
 * (`/auth/passkey/*`); the dashboard settings page calls `authClient.passkey.*`
 * directly. Step-up only consumes already-registered credentials.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { upsertGrant } from '../../services/grants/upsert.js';
import {
  CosignerError,
  denyApproval,
  mintCosignerForApproval,
} from '../../services/stepup/cosigner.js';
import { authenticationOptions, verifyAuthentication } from '../../services/stepup/webauthn.js';
import { router, tenantProcedure } from '../index.js';

function deriveIntegrationIdFromCommand(command: string): string | null {
  // Commands look like `/github/issues/comment` — first segment is the
  // integration. Returns null when shape doesn't match (e.g. legacy or
  // multi-integration commands) so policies fall back to general scope.
  const match = command.match(/^\/([a-z0-9_-]+)\//);
  return match?.[1] ?? null;
}

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
const AuthenticationResponseSchema = z
  .object({ id: z.string(), rawId: z.string(), type: z.literal('public-key') })
  .passthrough();

/**
 * Cosigner-mint window: the first N seconds after request creation, during
 * which the SDK's `waitForApproval` is still polling and the agent's
 * in-flight call can be resumed. After this window the approval is still
 * actionable for 7 days — but only as a policy-save, not as a cosigner.
 */
const COSIGNER_WINDOW_SECONDS = 60;

function deriveStage(
  state: string,
  requestedAt: Date,
  expiresAt: Date,
  now: Date,
): 'pending' | 'awaiting_review' | 'approved' | 'denied' | 'expired' {
  if (state !== 'pending') return state as 'approved' | 'denied';
  if (expiresAt.getTime() <= now.getTime()) return 'expired';
  if (requestedAt.getTime() + COSIGNER_WINDOW_SECONDS * 1_000 <= now.getTime()) {
    return 'awaiting_review';
  }
  return 'pending';
}

export const stepupRouter = router({
  /** Non-expired pending + awaiting_review approvals for the current customer. */
  listPending: tenantProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const rows = await ctx.db.drizzle
      .select({
        id: schema.pushApprovals.id,
        agentId: schema.pushApprovals.agentId,
        agentName: schema.agents.name,
        command: schema.pushApprovals.command,
        resource: schema.pushApprovals.resource,
        state: schema.pushApprovals.state,
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
    return rows.map((r) => ({
      ...r,
      state: deriveStage(r.state, r.requestedAt, r.expiresAt, now),
      cosignerWindowEndsAt: new Date(
        r.requestedAt.getTime() + COSIGNER_WINDOW_SECONDS * 1_000,
      ).toISOString(),
    }));
  }),

  /**
   * History of resolved approvals (approved / denied / expired) for the
   * dashboard /app/approvals tabs. Pending approvals stay on listPending;
   * this proc returns everything else, optionally filtered by agent or
   * state set, ordered newest first.
   *
   * "Expired" is derived: a row with state='pending' whose expires_at <=
   * now() is folded into the expired bucket without requiring a state
   * change. This avoids needing a background sweeper to relabel rows.
   */
  listHistory: tenantProcedure
    .input(
      z
        .object({
          state: z.array(z.enum(['approved', 'denied', 'expired'])).optional(),
          agentId: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 100;
      const wants = new Set(input?.state ?? ['approved', 'denied', 'expired']);
      const dbStates: ('approved' | 'denied' | 'pending')[] = [];
      if (wants.has('approved')) dbStates.push('approved');
      if (wants.has('denied')) dbStates.push('denied');
      if (wants.has('expired')) dbStates.push('pending');
      if (dbStates.length === 0) return [];
      const now = new Date();
      const filters = [
        eq(schema.pushApprovals.customerId, ctx.customerId),
        inArray(schema.pushApprovals.state, dbStates),
      ];
      if (input?.agentId) filters.push(eq(schema.pushApprovals.agentId, input.agentId));
      const rows = await ctx.db.drizzle
        .select({
          id: schema.pushApprovals.id,
          agentId: schema.pushApprovals.agentId,
          agentName: schema.agents.name,
          command: schema.pushApprovals.command,
          resource: schema.pushApprovals.resource,
          state: schema.pushApprovals.state,
          expiresAt: schema.pushApprovals.expiresAt,
          requestedAt: schema.pushApprovals.requestedAt,
          decidedAt: schema.pushApprovals.decidedAt,
          decidedBy: schema.pushApprovals.decidedBy,
          decidedByName: schema.user.name,
          decidedByEmail: schema.user.email,
        })
        .from(schema.pushApprovals)
        .leftJoin(schema.agents, eq(schema.pushApprovals.agentId, schema.agents.id))
        .leftJoin(schema.user, eq(schema.pushApprovals.decidedBy, schema.user.id))
        .where(and(...filters))
        .orderBy(desc(schema.pushApprovals.requestedAt))
        .limit(limit);

      const approvalIds = rows.map((r) => r.id);
      const grantRows = approvalIds.length
        ? await ctx.db.drizzle
            .select({
              sourceApprovalId: schema.agentGrants.sourceApprovalId,
              scope: schema.agentGrants.scope,
              revokedAt: schema.agentGrants.revokedAt,
            })
            .from(schema.agentGrants)
            .where(
              and(
                eq(schema.agentGrants.customerId, ctx.customerId),
                inArray(schema.agentGrants.sourceApprovalId, approvalIds),
              ),
            )
        : [];
      const grantByApprovalId = new Map<string, { scope: 'exact' | 'any'; revoked: boolean }>();
      for (const g of grantRows) {
        if (!g.sourceApprovalId) continue;
        grantByApprovalId.set(g.sourceApprovalId, {
          scope: g.scope as 'exact' | 'any',
          revoked: g.revokedAt !== null,
        });
      }

      const out = rows
        .map((r) => {
          const folded =
            r.state === 'pending' && r.expiresAt.getTime() <= now.getTime() ? 'expired' : r.state;
          const grant = grantByApprovalId.get(r.id);
          const remembered = !!grant;
          const grantScope = grant?.scope ?? null;
          const grantRevoked = grant?.revoked ?? false;
          return { ...r, state: folded, remembered, grantScope, grantRevoked };
        })
        .filter((r) => wants.has(r.state as 'approved' | 'denied' | 'expired'));
      return out;
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
      const now = new Date();
      const effectiveState = deriveStage(row.state, row.requestedAt, row.expiresAt, now);
      const cosignerWindowEndsAt = new Date(
        row.requestedAt.getTime() + COSIGNER_WINDOW_SECONDS * 1_000,
      ).toISOString();
      return { ...row, state: effectiveState, cosignerWindowEndsAt };
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
        /** When true, promote the selected Cedar variant to a real policy
         *  in the org-level `policies` table and auto-map it to the
         *  requesting App via `agent_policies`. The operator can later
         *  map the same policy to other Apps from the dashboard.
         *  Stronger than `remember`; both may be set. */
        persistAsPolicy: z.boolean().optional(),
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
        let persistedPolicyId: string | undefined;
        if (input.remember || input.persistAsPolicy) {
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
            if (input.persistAsPolicy && chosenSnippet) {
              persistedPolicyId = await ctx.db.drizzle.transaction(async (tx) => {
                const policyName = `Step-up: ${approval.command} (${variantPick ?? 'custom'})`;
                const integrationId = deriveIntegrationIdFromCommand(approval.command);
                const [policyRow] = await tx
                  .insert(schema.policies)
                  .values({
                    customerId: ctx.customerId,
                    name: policyName,
                    cedarText: chosenSnippet,
                    ...(integrationId ? { integrationId } : {}),
                  })
                  .returning({ id: schema.policies.id });
                if (!policyRow) {
                  throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'policy insert failed',
                  });
                }
                await tx
                  .insert(schema.agentPolicies)
                  .values({
                    customerId: ctx.customerId,
                    agentId: approval.agentId,
                    policyId: policyRow.id,
                    source: 'step_up',
                    createdBy: ctx.session.user.id,
                  })
                  .onConflictDoNothing();
                return policyRow.id;
              });
            }
            if (input.remember) {
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
            }
            ctx.policyInvalidator.invalidate(ctx.customerId);
          }
        }
        return {
          approvalId: cosigner.approvalId,
          cosignerJwt: cosigner.cosignerJwt,
          expiresAt: cosigner.expiresAt.toISOString(),
          ...(input.remember ? { remembered: true } : {}),
          ...(persistedPolicyId ? { persistedPolicyId } : {}),
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
