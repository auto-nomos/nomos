import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { sha256Hex } from '@auto-nomos/crypto';
import type { AuditDecision, AuditEvent } from '@auto-nomos/shared-types';
import { canonicalize } from '@auto-nomos/ucan';

export const ZERO_HASH = '0'.repeat(64);

/**
 * Audit C3 — per-customer genesis hash. When the operator configures
 * AUDIT_GENESIS_SECRET, the postgres emitter uses this as the prev_hash for
 * a customer's very first event instead of the universal `ZERO_HASH`. The
 * version prefix `v1` is forward-compat: rotating to a real per-customer
 * signed root anchor in a follow-up bumps to `v2`. Pure function — same
 * inputs always produce the same hash so verifier can re-derive.
 */
export function auditGenesisHash(customerId: string, secret: string): string {
  return sha256Hex(`audit-genesis|v1|${customerId}|${secret}`);
}

export type AuditEventInput = Omit<AuditEvent, 'event_id' | 'prev_hash' | 'hash'>;

export interface AuditEmitter {
  emit(input: AuditEventInput): Promise<AuditEvent>;
  getLastHash(): string;
}

export interface AuditEmitterOptions {
  logPath: string;
  initialPrevHash?: string;
  /** Replaceable for testing: if omitted, uses fs.appendFile. */
  writer?: (path: string, line: string) => Promise<void>;
}

export function decisionToAudit(decision: {
  allow: boolean;
  requiresStepUp?: boolean;
}): AuditDecision {
  if (decision.allow) return 'allow';
  if (decision.requiresStepUp) return 'stepup';
  return 'deny';
}

export function createAuditEmitter(opts: AuditEmitterOptions): AuditEmitter {
  let lastHash = opts.initialPrevHash ?? ZERO_HASH;
  const write = opts.writer ?? defaultWriter;

  return {
    async emit(input) {
      const eventId = randomUUID();
      const prevHash = lastHash;
      const partial = {
        event_id: eventId,
        prev_hash: prevHash,
        ...input,
      };
      const hash = sha256Hex(
        `${prevHash}|${canonicalize(partial as unknown as Record<string, unknown>)}`,
      );
      const event: AuditEvent = { ...partial, hash };
      lastHash = hash;
      await write(opts.logPath, `${JSON.stringify(event)}\n`);
      return event;
    },
    getLastHash() {
      return lastHash;
    },
  };
}

async function defaultWriter(path: string, line: string): Promise<void> {
  await appendFile(path, line, 'utf8');
}
