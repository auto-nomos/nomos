import { sha256Hex } from '@auto-nomos/crypto';
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

/** Stable JSON for hashing: sort object keys recursively. Arrays preserve order. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

export function computeResourceHash(resource: Record<string, unknown>): string {
  return sha256Hex(canonicalJson(resource));
}

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

export const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function createStepUpApproval(
  input: StepUpCreateInput,
  deps: StepUpCreateDeps,
): Promise<StepUpCreated> {
  const ttlSeconds = input.ttlSeconds ?? deps.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = (deps.now ?? (() => new Date()))();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000);
  const resourceHash = computeResourceHash(input.resource);
  const buildDeepLink = (id: string): string =>
    `${deps.dashboardPublicUrl.replace(/\/+$/, '')}/approve/${id}`;

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

  // Dedup: at most one 'pending' row per (customer, agent, command, resourceHash)
  // is allowed by the unique partial index. If one already exists, decide
  // whether to reuse (still valid) or refresh-in-place (expired).
  const [existing] = await deps.db
    .select({ id: schema.pushApprovals.id, expiresAt: schema.pushApprovals.expiresAt })
    .from(schema.pushApprovals)
    .where(
      and(
        eq(schema.pushApprovals.customerId, input.customerId),
        eq(schema.pushApprovals.agentId, input.agentId),
        eq(schema.pushApprovals.command, input.command),
        eq(schema.pushApprovals.resourceHash, resourceHash),
        eq(schema.pushApprovals.state, 'pending'),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.expiresAt > now) {
      deps.logger.info(
        { approvalId: existing.id, agentId: input.agentId, command: input.command },
        'step-up dedup: reusing existing pending approval',
      );
      return {
        id: existing.id,
        expiresAt: existing.expiresAt,
        deepLink: buildDeepLink(existing.id),
      };
    }
    // Expired pending row — refresh in place so the same /approve/:id link
    // keeps working and the unique index isn't violated by a duplicate.
    deps.logger.info(
      { approvalId: existing.id, agentId: input.agentId, command: input.command },
      'step-up dedup: refreshing expired pending approval',
    );
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
    // Fallback: bot /start writes to customer_telegram_links but prior code
    // did not mirror into notification_preferences. If we don't have a chat
    // id yet, pull the active link so Telegram pushes still fire.
    if (!ownerPrefs?.telegramChatId) {
      const [link] = await deps.db
        .select({ chatId: schema.customerTelegramLinks.chatId })
        .from(schema.customerTelegramLinks)
        .where(
          and(
            eq(schema.customerTelegramLinks.customerId, input.customerId),
            eq(schema.customerTelegramLinks.userId, owner.userId),
            eq(schema.customerTelegramLinks.enabled, true),
          ),
        )
        .limit(1);
      if (link) {
        ownerPrefs = {
          telegramChatId: link.chatId,
          telegramEnabled: ownerPrefs?.telegramEnabled ?? true,
          emailEnabled: ownerPrefs?.emailEnabled ?? true,
          webPushEnabled: ownerPrefs?.webPushEnabled ?? true,
        };
      }
    }
  }

  let row: { id: string; expiresAt: Date } | undefined;
  if (existing) {
    const [refreshed] = await deps.db
      .update(schema.pushApprovals)
      .set({
        resource: input.resource,
        requestedAt: now,
        expiresAt,
        riskScore,
        riskSummary,
        cedarPreview,
        cedarVariants,
        recommendedScope,
        ...(input.originalUcanCid ? { originalUcanCid: input.originalUcanCid } : {}),
      })
      .where(eq(schema.pushApprovals.id, existing.id))
      .returning({ id: schema.pushApprovals.id, expiresAt: schema.pushApprovals.expiresAt });
    row = refreshed;
  } else {
    const [inserted] = await deps.db
      .insert(schema.pushApprovals)
      .values({
        customerId: input.customerId,
        agentId: input.agentId,
        command: input.command,
        resource: input.resource,
        resourceHash,
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
    row = inserted;
  }
  if (!row) {
    throw new Error('push_approvals upsert returned no rows');
  }

  const deepLink = buildDeepLink(row.id);

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
