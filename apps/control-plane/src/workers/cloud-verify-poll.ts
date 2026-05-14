/**
 * M9 risk-mitigation — cloud_connections verify poll.
 *
 * Every interval (default 24h), iterate cloud_connections and probe each
 * one via the actual federation flow. Updates `bootstrap_status`,
 * `last_verified_at`, `last_verify_error`.
 *
 * Probe per connector:
 *   - Azure: mint ID token + acquireSessionCreds. Cheap (one AAD call).
 *   - AWS:   mint ID token + AssumeRoleWithWebIdentity. Cheap (one STS).
 *   - GCP:   mint ID token + STS + impersonation. Two-hop, still cheap.
 *
 * No actual upstream call — just confirms the federation handshake works.
 * Customers see drift the moment they hand-edit a Terraform-managed
 * resource.
 *
 * Side-channel: when the probe fails with retryable=true, we don't flip
 * status to 'broken' on the first attempt — only after two consecutive
 * failures. Single retryable rejection is more likely a transient cloud
 * blip than a config drift.
 */

import { type CloudConnectorId, CloudFederationError, type CloudProvider } from '@auto-nomos/core';
import type { JwtSigner } from '@auto-nomos/crypto';
import { and, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';
import { mintIdToken } from '../oidc/mint.js';

export interface CloudVerifyPollOptions {
  db: DrizzleClient;
  registry: Map<CloudConnectorId, CloudProvider>;
  signer: JwtSigner;
  issuer: string;
  defaultTtlSeconds: number;
  logger: Logger;
  /** Default 24h. */
  intervalMs?: number;
}

export interface VerifyResult {
  status: 'verified' | 'broken' | 'transient';
  error?: string;
}

export interface CloudVerifyPoll {
  start(): void;
  stop(): void;
  /** Single-pass run, used by tests + ops "verify now" buttons. */
  runOnce(): Promise<{ checked: number; verified: number; broken: number; transient: number }>;
  /** Probe one connection synchronously. Used by the tRPC `verifyNow` mutation. */
  verifyOne(connectionId: string, customerId: string): Promise<VerifyResult>;
}

// In-memory transient-failure counter keyed by connectionId. Bumped on
// retryable failures; cleared on success. Persists across runOnce calls
// within a single process. Multi-replica deploys will double-count; ok
// for now since the flip-to-broken threshold is intentionally generous.
const transientCounts = new Map<string, number>();

export function createCloudVerifyPoll(opts: CloudVerifyPollOptions): CloudVerifyPoll {
  const intervalMs = opts.intervalMs ?? 24 * 60 * 60 * 1_000;
  let timer: NodeJS.Timeout | undefined;

  async function probe(
    connection: typeof schema.cloudConnections.$inferSelect,
  ): Promise<VerifyResult> {
    const provider = opts.registry.get(connection.connector);
    if (!provider) {
      return { status: 'broken', error: `provider_unsupported:${connection.connector}` };
    }
    const audience = provider.audienceFor({
      id: connection.id,
      customerId: connection.customerId,
      connector: connection.connector,
      accountId: connection.accountId,
      tenantId: connection.tenantId,
      externalId: connection.externalId,
      config: (connection.config ?? {}) as Record<string, unknown>,
    });
    try {
      const idToken = await mintIdToken(opts.signer, opts.issuer, {
        customerId: connection.customerId,
        agentId: 'verify-poll',
        audience: audience.audience,
        ttlSeconds: audience.ttlSeconds ?? opts.defaultTtlSeconds,
      });
      await provider.acquireSessionCreds(
        {
          id: connection.id,
          customerId: connection.customerId,
          connector: connection.connector,
          accountId: connection.accountId,
          tenantId: connection.tenantId,
          externalId: connection.externalId,
          config: (connection.config ?? {}) as Record<string, unknown>,
        },
        idToken.token,
      );
      transientCounts.delete(connection.id);
      return { status: 'verified' };
    } catch (err) {
      if (err instanceof CloudFederationError && err.retryable) {
        const count = (transientCounts.get(connection.id) ?? 0) + 1;
        transientCounts.set(connection.id, count);
        if (count < 2) return { status: 'transient', error: err.message };
        transientCounts.delete(connection.id);
        return { status: 'broken', error: `${err.message} (after 2 retryable)` };
      }
      return { status: 'broken', error: (err as Error).message };
    }
  }

  async function runOnce(): Promise<{
    checked: number;
    verified: number;
    broken: number;
    transient: number;
  }> {
    const rows = await opts.db.select().from(schema.cloudConnections);
    let verified = 0;
    let broken = 0;
    let transient = 0;
    for (const row of rows) {
      const result = await probe(row);
      const now = new Date();
      await opts.db
        .update(schema.cloudConnections)
        .set({
          bootstrapStatus:
            result.status === 'transient'
              ? row.bootstrapStatus
              : (result.status as 'verified' | 'broken'),
          lastVerifiedAt: result.status === 'verified' ? now : row.lastVerifiedAt,
          lastVerifyError: result.error ?? null,
          updatedAt: now,
        })
        .where(eq(schema.cloudConnections.id, row.id));
      if (result.status === 'verified') verified++;
      else if (result.status === 'broken') broken++;
      else transient++;
    }
    return { checked: rows.length, verified, broken, transient };
  }

  async function verifyOne(connectionId: string, customerId: string): Promise<VerifyResult> {
    const [row] = await opts.db
      .select()
      .from(schema.cloudConnections)
      .where(
        and(
          eq(schema.cloudConnections.id, connectionId),
          eq(schema.cloudConnections.customerId, customerId),
        ),
      )
      .limit(1);
    if (!row) return { status: 'broken', error: 'connection_not_found' };
    const result = await probe(row);
    const now = new Date();
    await opts.db
      .update(schema.cloudConnections)
      .set({
        bootstrapStatus:
          result.status === 'transient'
            ? row.bootstrapStatus
            : (result.status as 'verified' | 'broken'),
        lastVerifiedAt: result.status === 'verified' ? now : row.lastVerifiedAt,
        lastVerifyError: result.error ?? null,
        updatedAt: now,
      })
      .where(eq(schema.cloudConnections.id, row.id));
    return result;
  }

  return {
    verifyOne,
    start() {
      if (timer) return;
      timer = setInterval(() => {
        runOnce()
          .then((result) => opts.logger.info(result, 'cloud verify poll complete'))
          .catch((err) => opts.logger.error({ err }, 'cloud verify poll failed'));
      }, intervalMs);
      // Run once at startup, slightly delayed so the rest of bring-up finishes.
      setTimeout(() => {
        runOnce()
          .then((result) => opts.logger.info(result, 'cloud verify poll (startup)'))
          .catch((err) => opts.logger.error({ err }, 'cloud verify poll (startup) failed'));
      }, 10_000);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    runOnce,
  };
}
