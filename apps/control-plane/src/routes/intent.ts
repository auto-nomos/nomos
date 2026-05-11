/**
 * POST /v1/intent — dynamic per-request scope narrowing.
 *
 * SDK supplies a structured `Intent` (resource constraint + actions +
 * ttl). The route classifies it against the agent's active envelopes:
 *
 *   - silent mint when an envelope covers the intent and no high-risk
 *     heuristic fires;
 *   - step-up otherwise — the SDK polls the existing approval flow and
 *     retries the call with `cosignerJwt`, which we validate before
 *     creating a new envelope and minting a child UCAN inside it.
 *
 * The minted UCAN's `meta.resource_constraint` is the issuer-vouched
 * bound the PDP enforces in `decide()` (packages/core).
 */

import {
  type IntentRequest,
  IntentRequest as IntentRequestSchema,
  type IntentResponse,
} from '@auto-nomos/shared-types';
import { constraintCovers, parseUcanJwt, validateUcan } from '@auto-nomos/ucan';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { type ApiKeyAuthVariables, apiKeyAuth } from '../middleware/api-key-auth.js';
import { getLog } from '../middleware/logger.js';
import {
  createEnvelope,
  createStandingEnvelope,
  type Envelope,
  listActiveEnvelopes,
} from '../services/envelope-store.js';
import { classifyIntent } from '../services/intent-classifier.js';
import type { CoherenceVerifier } from '../services/intent-coherence.js';
import { createStepUpApproval } from '../services/stepup/create.js';
import type { StepUpNotifier } from '../services/stepup/notify.js';
import { mintUcan } from '../services/ucan-mint.js';

export interface IntentRouteDeps {
  db: Db;
  signing: { signKey: Uint8Array; signerDid: string };
  stepup: {
    notifier: StepUpNotifier;
    dashboardPublicUrl: string;
    defaultTtlSeconds?: number;
  };
  /** Optional LLM coherence verifier. Wired in index.ts when
   *  INTENT_COHERENCE_ENABLED + ANTHROPIC_API_KEY are set. */
  coherenceVerifier?: CoherenceVerifier;
}

const ENVELOPE_DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const ENVELOPE_COMMAND = '/__envelope__';

export function createIntentRoutes(
  deps: IntentRouteDeps,
): Hono<{ Variables: ApiKeyAuthVariables }> {
  const app = new Hono<{ Variables: ApiKeyAuthVariables }>();

  app.post('/v1/intent', apiKeyAuth({ db: deps.db }), async (c) => {
    const log = getLog(c);
    const customerId = c.get('customerId');
    const apiKeyAgentId = c.get('agentId');

    const raw = await c.req.json().catch(() => null);
    if (!raw) {
      return c.json({ error: 'invalid JSON body', error_code: 'invalid_body' }, 400);
    }
    // Body's agentId is informational; the api-key's agent is authoritative.
    const parsed = IntentRequestSchema.safeParse({ ...raw, agentId: apiKeyAgentId });
    if (!parsed.success) {
      return c.json(
        { error: 'invalid request', error_code: 'invalid_body', issues: parsed.error.issues },
        400,
      );
    }
    const body: IntentRequest = parsed.data;

    // Per-agent mode flag — operators opt agents into dynamic mode
    // explicitly. Static is the safe default; trying to use /v1/intent
    // there is a configuration mistake we surface immediately.
    const [agentRow] = await deps.db.drizzle
      .select({ mode: schema.agents.mode })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, apiKeyAgentId), eq(schema.agents.customerId, customerId)))
      .limit(1);
    if (!agentRow) {
      return c.json({ error: 'agent not found', error_code: 'agent_not_found' }, 404);
    }
    if (agentRow.mode !== 'dynamic') {
      return c.json(
        {
          error: 'agent is in static mode — toggle to dynamic on the dashboard to use /v1/intent',
          error_code: 'agent_static_mode',
        },
        403,
      );
    }

    // Step-up retry path — caller has a cosigner JWT from a prior approval.
    if (body.cosignerJwt) {
      const cosignerCheck = await validateCosignerForIntent(deps.db, body.cosignerJwt, body.intent);
      if (!cosignerCheck.ok) {
        return c.json(
          { error: cosignerCheck.reason, error_code: cosignerCheck.reason },
          cosignerCheck.reason === 'cosigner_expired' ? 401 : 403,
        );
      }
      const envelope =
        cosignerCheck.mode === 'standing'
          ? await createStandingEnvelope(deps.db.drizzle, {
              customerId,
              agentId: apiKeyAgentId,
              constraint: body.intent.constraint,
              actions: body.intent.actions,
              createdBy: cosignerCheck.decidingUserId,
            })
          : await createEnvelope(deps.db.drizzle, {
              customerId,
              agentId: apiKeyAgentId,
              constraint: body.intent.constraint,
              actions: body.intent.actions,
              ttlSeconds: ENVELOPE_DEFAULT_TTL_SECONDS,
              createdBy: cosignerCheck.decidingUserId,
            });
      const result = await mintChildUcan(deps, customerId, apiKeyAgentId, envelope, body.intent);
      log.info(
        {
          customerId,
          agentId: apiKeyAgentId,
          envelopeId: envelope.id,
          standing: envelope.isStanding,
        },
        'intent step-up retry → envelope + child UCAN minted',
      );
      return c.json(result satisfies IntentResponse);
    }

    // Fresh classification path.
    const envelopes = await listActiveEnvelopes(deps.db.drizzle, customerId, apiKeyAgentId);
    const decision = await classifyIntent(
      {
        constraint: body.intent.constraint,
        actions: body.intent.actions,
        envelopes,
        ...(body.intent.purpose !== undefined ? { purpose: body.intent.purpose } : {}),
        ...(body.intent.requestArgs !== undefined ? { requestArgs: body.intent.requestArgs } : {}),
      },
      {
        ...(deps.coherenceVerifier !== undefined ? { verifier: deps.coherenceVerifier } : {}),
      },
    );

    if (decision.kind === 'mint') {
      const result = await mintChildUcan(
        deps,
        customerId,
        apiKeyAgentId,
        decision.envelope,
        body.intent,
      );
      log.info(
        { customerId, agentId: apiKeyAgentId, envelopeId: decision.envelope.id },
        'intent silent mint inside active envelope',
      );
      return c.json(result satisfies IntentResponse);
    }

    // Step-up required — write a push_approvals row carrying the proposed
    // envelope spec, push to the customer owner, return the deep link.
    const approval = await createStepUpApproval(
      {
        customerId,
        agentId: apiKeyAgentId,
        command: ENVELOPE_COMMAND,
        resource: {
          kind: 'envelope',
          constraint: body.intent.constraint,
          actions: body.intent.actions,
          ttlSeconds: body.intent.ttlSeconds,
          reason: decision.reason,
        },
      },
      {
        db: deps.db.drizzle,
        notifier: deps.stepup.notifier,
        dashboardPublicUrl: deps.stepup.dashboardPublicUrl,
        ...(deps.stepup.defaultTtlSeconds !== undefined
          ? { defaultTtlSeconds: deps.stepup.defaultTtlSeconds }
          : {}),
        logger: log,
      },
    );

    const response: IntentResponse = {
      kind: 'stepup',
      stepUpId: approval.id,
      stepUpUrl: approval.deepLink,
      proposedEnvelope: {
        constraint: body.intent.constraint,
        actions: body.intent.actions,
        ttlSeconds: body.intent.ttlSeconds,
      },
    };
    return c.json(response);
  });

  return app;
}

async function mintChildUcan(
  deps: IntentRouteDeps,
  customerId: string,
  agentId: string,
  envelope: Envelope,
  intent: IntentRequest['intent'],
): Promise<IntentResponse> {
  // One UCAN per action; the SDK can pass several. For the first slice
  // we mint against the first action and rely on the SDK requesting one
  // action per intent. Multi-action expansion is a small follow-up.
  const command = intent.actions[0]!;
  const result = await mintUcan(
    {
      customerId,
      agentId,
      command,
      ttlSeconds: intent.ttlSeconds,
      nonce: `${Date.now()}-intent-${envelope.id}`,
      resourceConstraint: intent.constraint,
      mode: 'dynamic',
    },
    {
      db: deps.db.drizzle,
      signKey: deps.signing.signKey,
      signerDid: deps.signing.signerDid,
    },
  );
  return {
    kind: 'mint',
    ucan: result.jwt,
    envelopeId: envelope.id,
    expiresAt: Math.floor(result.expiresAt.getTime() / 1000),
  };
}

type CosignerCheck =
  | { ok: true; decidingUserId: string; mode: 'session' | 'standing' }
  | { ok: false; reason: 'cosigner_invalid' | 'cosigner_expired' | 'cosigner_mismatch' };

/**
 * Local cosigner validation for the /v1/intent step-up retry. Differs
 * from the PDP-side validator in that we have no `requestUcan` to bind
 * against — the binding is the approval row's stored envelope spec
 * matching the body's intent.
 */
async function validateCosignerForIntent(
  db: Db,
  cosignerJwt: string,
  intent: IntentRequest['intent'],
): Promise<CosignerCheck> {
  const parsed = parseUcanJwt(cosignerJwt);
  if ('error' in parsed) return { ok: false, reason: 'cosigner_invalid' };
  const meta = parsed.payload.meta as Record<string, unknown> | undefined;
  const approvalId = typeof meta?.approval_id === 'string' ? meta.approval_id : undefined;
  if (!approvalId) return { ok: false, reason: 'cosigner_invalid' };

  const validation = validateUcan(cosignerJwt, { expectedCommand: ENVELOPE_COMMAND });
  if (!validation.valid) {
    return {
      ok: false,
      reason: validation.error === 'expired' ? 'cosigner_expired' : 'cosigner_invalid',
    };
  }

  const [approval] = await db.drizzle
    .select()
    .from(schema.pushApprovals)
    .where(eq(schema.pushApprovals.id, approvalId))
    .limit(1);
  if (!approval) return { ok: false, reason: 'cosigner_invalid' };
  if (approval.state !== 'approved') return { ok: false, reason: 'cosigner_invalid' };
  if (approval.cosignerAttestationJwt !== cosignerJwt) {
    return { ok: false, reason: 'cosigner_mismatch' };
  }
  if (!matchesEnvelopeSpec(approval.resource, intent)) {
    return { ok: false, reason: 'cosigner_mismatch' };
  }
  const mode = meta?.mode === 'standing' ? 'standing' : 'session';
  return { ok: true, decidingUserId: approval.decidedBy ?? '', mode };
}

function matchesEnvelopeSpec(stored: unknown, intent: IntentRequest['intent']): boolean {
  if (!stored || typeof stored !== 'object') return false;
  const r = stored as Record<string, unknown>;
  if (r.kind !== 'envelope') return false;
  const c = r.constraint as IntentRequest['intent']['constraint'] | undefined;
  if (!c) return false;
  // Mutual subset = equality. constraintCovers handles every provider
  // variant so adding new providers (github, slack, …) needs no
  // change here.
  if (!constraintCovers(c, intent.constraint)) return false;
  if (!constraintCovers(intent.constraint, c)) return false;
  const storedActions = Array.isArray(r.actions) ? (r.actions as string[]) : [];
  if (storedActions.length !== intent.actions.length) return false;
  for (const a of intent.actions) if (!storedActions.includes(a)) return false;
  return true;
}

// Suppress unused-import lint when build flags drop dead branches.
void and;
