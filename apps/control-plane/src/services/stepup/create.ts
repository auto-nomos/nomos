import { and, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import type { Logger } from '../../logger.js';
import {
  buildCedarPreview,
  buildCedarVariants,
  type CedarVariants,
  fallbackRiskSummary,
  type RiskSummarizer,
  type VariantScope,
} from '../grants/llm-risk-summary.js';
import type { StepUpNotifier } from './notify.js';

export class StepUpCreateError extends Error {
  readonly code: 'agent_not_found' | 'customer_owner_missing';
  constructor(code: StepUpCreateError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'StepUpCreateError';
  }
}

export interface StepUpCreateInput {
  customerId: string;
  agentId: string;
  command: string;
  resource: Record<string, unknown>;
  ttlSeconds?: number;
  /** CID of the original UCAN that triggered step-up. */
  originalUcanCid?: string;
}

export interface StepUpCreated {
  id: string;
  expiresAt: Date;
  deepLink: string;
}

export interface StepUpCreateDeps {
  db: DrizzleClient;
  notifier: StepUpNotifier;
  dashboardPublicUrl: string;
  defaultTtlSeconds?: number;
  logger: Logger;
  /** Optional LLM-backed risk summarizer; falls back to deterministic if absent. */
  riskSummarizer?: RiskSummarizer;
  now?: () => Date;
}

const DEFAULT_TTL_SECONDS = 60;

export async function createStepUpApproval(
  input: StepUpCreateInput,
  deps: StepUpCreateDeps,
): Promise<StepUpCreated> {
  const ttlSeconds = input.ttlSeconds ?? deps.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = (deps.now ?? (() => new Date()))();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000);

  const [agent] = await deps.db
    .select({
      id: schema.agents.id,
      customerId: schema.agents.customerId,
      name: schema.agents.name,
    })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.customerId, input.customerId)))
    .limit(1);
  if (!agent) {
    throw new StepUpCreateError('agent_not_found', 'agent not found for this customer');
  }

  let riskScore: 'low' | 'medium' | 'high' = 'medium';
  let riskSummary: string | null = null;
  let cedarPreview = buildCedarPreview({
    agentName: agent.name,
    command: input.command,
    resource: input.resource,
  });
  let cedarVariants: CedarVariants = buildCedarVariants({
    agentName: agent.name,
    command: input.command,
    resource: input.resource,
  });
  let recommendedScope: VariantScope = 'narrow';
  if (deps.riskSummarizer) {
    const r = await deps.riskSummarizer({
      agentName: agent.name,
      command: input.command,
      resource: input.resource,
    });
    if (r) {
      riskScore = r.riskScore;
      riskSummary = r.summary;
      cedarPreview = r.cedarPreview;
      cedarVariants = r.cedarVariants;
      recommendedScope = r.recommendedScope;
    }
  }
  if (riskSummary === null) {
    const fb = fallbackRiskSummary({
      agentName: agent.name,
      command: input.command,
      resource: input.resource,
    });
    riskScore = fb.riskScore;
    riskSummary = fb.summary;
    cedarPreview = fb.cedarPreview;
    cedarVariants = fb.cedarVariants;
    recommendedScope = fb.recommendedScope;
  }

  const [owner] = await deps.db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.customerId, input.customerId),
        eq(schema.memberships.role, 'owner'),
      ),
    )
    .limit(1);

  let ownerPrefs:
    | {
        telegramChatId: string | null;
        telegramEnabled: boolean;
        emailEnabled: boolean;
        webPushEnabled: boolean;
      }
    | undefined;
  if (owner) {
    const [row] = await deps.db
      .select({
        telegramChatId: schema.notificationPreferences.telegramChatId,
        telegramEnabled: schema.notificationPreferences.telegramEnabled,
        emailEnabled: schema.notificationPreferences.emailEnabled,
        webPushEnabled: schema.notificationPreferences.webPushEnabled,
      })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, owner.userId))
      .limit(1);
    if (row) ownerPrefs = row;
  }

  const [row] = await deps.db
    .insert(schema.pushApprovals)
    .values({
      customerId: input.customerId,
      agentId: input.agentId,
      command: input.command,
      resource: input.resource,
      state: 'pending',
      requestedAt: now,
      expiresAt,
      riskScore,
      riskSummary,
      cedarPreview,
      cedarVariants,
      recommendedScope,
      ...(input.originalUcanCid ? { originalUcanCid: input.originalUcanCid } : {}),
    })
    .returning({ id: schema.pushApprovals.id, expiresAt: schema.pushApprovals.expiresAt });
  if (!row) {
    throw new Error('push_approvals insert returned no rows');
  }

  const deepLink = `${deps.dashboardPublicUrl.replace(/\/+$/, '')}/approve/${row.id}`;

  if (owner) {
    void deps
      .notifier({
        approvalId: row.id,
        customerId: input.customerId,
        agentId: input.agentId,
        decidingUserId: owner.userId,
        command: input.command,
        resource: input.resource,
        deepLink,
        ttlSeconds,
        riskScore,
        riskSummary,
        recommendedScope,
        ...(ownerPrefs ? { prefs: ownerPrefs } : {}),
      })
      .catch((err) => {
        deps.logger.warn(
          { err, approvalId: row.id },
          'step-up notifier failed (caller still gets approval id)',
        );
      });
  } else {
    deps.logger.warn(
      { customerId: input.customerId, approvalId: row.id },
      'no customer owner found — push notification skipped; approval still pending',
    );
  }

  return { id: row.id, expiresAt: row.expiresAt, deepLink };
}
