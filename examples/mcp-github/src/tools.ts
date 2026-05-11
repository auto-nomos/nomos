import type { AuthGuard, AuthorizeDecision } from '@auto-nomos/sdk';
import type { Octokit } from 'octokit';
import { z } from 'zod';

export interface ToolDeps {
  octokit: Pick<Octokit, 'rest'>;
  guard: AuthGuard;
  ucan: string;
}

export interface ToolResultJson {
  status: 'allowed' | 'denied' | 'failed';
  decision?: { allow: boolean; reason?: string; receiptId?: string };
  data?: unknown;
  error?: string;
}

export const CreateIssueInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
});

export const ReadRepoInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

export const MergePrInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  prNumber: z.number().int().positive(),
});

export type CreateIssueInput = z.infer<typeof CreateIssueInput>;
export type ReadRepoInput = z.infer<typeof ReadRepoInput>;
export type MergePrInput = z.infer<typeof MergePrInput>;

export async function createIssue(
  deps: ToolDeps,
  input: CreateIssueInput,
): Promise<ToolResultJson> {
  return runGuarded(
    deps,
    '/github/issue/create',
    { repo: `${input.owner}/${input.repo}` },
    async () => {
      const res = await deps.octokit.rest.issues.create({
        owner: input.owner,
        repo: input.repo,
        title: input.title,
        ...(input.body !== undefined ? { body: input.body } : {}),
      });
      return { number: res.data.number, url: res.data.html_url };
    },
  );
}

export async function readRepo(deps: ToolDeps, input: ReadRepoInput): Promise<ToolResultJson> {
  return runGuarded(
    deps,
    '/github/repo/read',
    { repo: `${input.owner}/${input.repo}` },
    async () => {
      const res = await deps.octokit.rest.repos.get({ owner: input.owner, repo: input.repo });
      return {
        name: res.data.full_name,
        private: res.data.private,
        defaultBranch: res.data.default_branch,
      };
    },
  );
}

export async function mergePr(deps: ToolDeps, input: MergePrInput): Promise<ToolResultJson> {
  return runGuarded(
    deps,
    '/github/pr/merge',
    { repo: `${input.owner}/${input.repo}`, pr: input.prNumber },
    async () => {
      const res = await deps.octokit.rest.pulls.merge({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.prNumber,
      });
      return { merged: res.data.merged, sha: res.data.sha };
    },
  );
}

async function runGuarded(
  deps: ToolDeps,
  command: string,
  resource: Record<string, unknown>,
  exec: () => Promise<unknown>,
): Promise<ToolResultJson> {
  const decision: AuthorizeDecision = await deps.guard.authorize({
    ucan: deps.ucan,
    command,
    resource,
    context: {},
  });

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
    await deps.guard.emitReceipt(decision.receiptId, { outcome: 'success' }).catch(() => undefined); // best-effort; receipt failures don't undo the upstream call
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
