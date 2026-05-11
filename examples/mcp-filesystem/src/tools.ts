import { readdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { AuthGuard, AuthorizeDecision, IntentClient } from '@auto-nomos/sdk';
import { z } from 'zod';

export interface ToolDeps {
  guard: AuthGuard;
  intent: IntentClient;
  /**
   * How the example resolves a step-up. The bin wires this to a CLI
   * prompt that prints the deep link and waits for the operator to
   * paste back a cosigner JWT after passkey approval. In production
   * this would be the SDK's waitForApproval polling the dashboard.
   */
  awaitApproval: (stepUpId: string, stepUpUrl: string) => Promise<string>;
}

export const ReadPathInput = z.object({
  path: z.string().min(1),
});
export const ListPathInput = z.object({
  path: z.string().min(1),
});

export type ReadPathInput = z.infer<typeof ReadPathInput>;
export type ListPathInput = z.infer<typeof ListPathInput>;

export interface ToolResultJson {
  status: 'allowed' | 'denied' | 'failed';
  decision?: { allow: boolean; reason?: string; receiptId?: string };
  data?: unknown;
  error?: string;
  envelopeId?: string;
}

/**
 * Read a single file. Envelope is scoped to the *exact target file*
 * (`path_prefix === target`). Filesystem adapter allows
 * `realRequested === realPrefix`, so the grant covers that file and
 * nothing else. Sibling files in the same directory force a fresh
 * step-up because they aren't covered by any active envelope.
 */
export async function readPath(deps: ToolDeps, input: ReadPathInput): Promise<ToolResultJson> {
  const target = path.resolve(input.path);
  const prefix = target;
  return runScoped(deps, '/filesystem/read', prefix, target, async (ucan) => {
    const decision = await deps.guard.authorize({
      ucan,
      command: '/filesystem/read',
      resource: { path: target },
      context: {},
    });
    return execIfAllowed(deps, decision, async () => {
      const stats = await stat(target);
      if (!stats.isFile()) throw new Error(`not a regular file: ${target}`);
      const bytes = await readFile(target, 'utf8');
      return { path: target, bytes };
    });
  });
}

export async function listPath(deps: ToolDeps, input: ListPathInput): Promise<ToolResultJson> {
  const target = path.resolve(input.path);
  const prefix = target.endsWith(path.sep) ? target : target + path.sep;
  return runScoped(deps, '/filesystem/list', prefix, target, async (ucan) => {
    const decision = await deps.guard.authorize({
      ucan,
      command: '/filesystem/list',
      resource: { path: target },
      context: {},
    });
    return execIfAllowed(deps, decision, async () => {
      const entries = await readdir(target, { withFileTypes: true });
      return {
        path: target,
        entries: entries.map((e) => ({ name: e.name, dir: e.isDirectory() })),
      };
    });
  });
}

async function runScoped(
  deps: ToolDeps,
  command: string,
  pathPrefix: string,
  _target: string,
  exec: (ucan: string) => Promise<ToolResultJson>,
): Promise<ToolResultJson> {
  let grant;
  try {
    grant = await deps.intent.acquire(
      {
        constraint: { provider: 'filesystem', path_prefix: pathPrefix },
        actions: [command],
        ttlSeconds: 300,
      },
      deps.awaitApproval,
    );
  } catch (err) {
    return { status: 'denied', error: (err as Error).message };
  }
  try {
    const result = await exec(grant.ucan);
    return { ...result, envelopeId: grant.envelopeId };
  } finally {
    grant[Symbol.dispose]();
  }
}

async function execIfAllowed(
  deps: ToolDeps,
  decision: AuthorizeDecision,
  exec: () => Promise<unknown>,
): Promise<ToolResultJson> {
  if (!decision.allow) {
    return {
      status: 'denied',
      decision: {
        allow: false,
        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
        receiptId: decision.receiptId,
      },
    };
  }
  try {
    const data = await exec();
    await deps.guard.emitReceipt(decision.receiptId, { outcome: 'success' }).catch(() => undefined);
    return {
      status: 'allowed',
      decision: { allow: true, receiptId: decision.receiptId },
      data,
    };
  } catch (err) {
    await deps.guard
      .emitReceipt(decision.receiptId, {
        outcome: 'failure',
        metadata: { message: (err as Error).message },
      })
      .catch(() => undefined);
    return {
      status: 'failed',
      decision: { allow: true, receiptId: decision.receiptId },
      error: (err as Error).message,
    };
  }
}
