import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { sha256Hex } from '@auto-nomos/crypto';
import type { AuditDecision, AuditEvent } from '@auto-nomos/shared-types';
import { canonicalize } from '@auto-nomos/ucan';

export const ZERO_HASH = '0'.repeat(64);

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
