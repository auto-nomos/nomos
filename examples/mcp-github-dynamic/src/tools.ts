/**
 * mcp-github-dynamic tool handlers — every call goes through
 * /v1/intent before hitting GitHub. The agent never holds a static
 * GitHub UCAN; it asks the broker for one scoped exactly to the
 * owner/repo/issue/pr it wants.
 *
 * Compare with `examples/mcp-github` which uses the *static* mintUcan
 * + guard.proxy path. Both can run side-by-side for the same agent if
 * the agent is in dynamic mode (static mintUcan stays available so the
 * old path keeps working during migration).
 */
import type {
  AuthGuard,
  GithubConstraint,
  IntentClient,
  ProxyApiCall,
  ProxyResult,
} from '@auto-nomos/sdk';
import { z } from 'zod';

export interface ToolDeps {
  guard: AuthGuard;
  intent: IntentClient;
  awaitApproval: (stepUpId: string, stepUpUrl: string) => Promise<string>;
}

export interface ToolResultJson {
  status: 'allowed' | 'denied' | 'failed';
  decision?: { allow: boolean; reason?: string; receiptId?: string };
  upstream?: { status: number; body: unknown };
  envelopeId?: string;
  error?: string;
}

export const ReadRepoInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});
export type ReadRepoInput = z.infer<typeof ReadRepoInput>;

export const ReadIssueInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issue_number: z.number().int().positive(),
});
export type ReadIssueInput = z.infer<typeof ReadIssueInput>;

export const CreateIssueInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
});
export type CreateIssueInput = z.infer<typeof CreateIssueInput>;

export const MergePrInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pr_number: z.number().int().positive(),
  commit_title: z.string().optional(),
});
export type MergePrInput = z.infer<typeof MergePrInput>;

export async function readRepo(deps: ToolDeps, input: ReadRepoInput): Promise<ToolResultJson> {
  const constraint: GithubConstraint = {
    provider: 'github',
    owner: input.owner,
    repo: input.repo,
  };
  return runScoped(deps, '/github/repo/read', constraint, {
    method: 'GET',
    path: `/repos/${input.owner}/${input.repo}`,
  });
}

export async function readIssue(deps: ToolDeps, input: ReadIssueInput): Promise<ToolResultJson> {
  const constraint: GithubConstraint = {
    provider: 'github',
    owner: input.owner,
    repo: input.repo,
    issue_number: input.issue_number,
  };
  return runScoped(deps, '/github/issue/read', constraint, {
    method: 'GET',
    path: `/repos/${input.owner}/${input.repo}/issues/${input.issue_number}`,
  });
}

export async function createIssue(
  deps: ToolDeps,
  input: CreateIssueInput,
): Promise<ToolResultJson> {
  const constraint: GithubConstraint = {
    provider: 'github',
    owner: input.owner,
    repo: input.repo,
  };
  return runScoped(
    deps,
    '/github/issue/create',
    constraint,
    {
      method: 'POST',
      path: `/repos/${input.owner}/${input.repo}/issues`,
      body: { title: input.title, ...(input.body ? { body: input.body } : {}) },
    },
    { owner: input.owner, repo: input.repo },
  );
}

export async function mergePr(deps: ToolDeps, input: MergePrInput): Promise<ToolResultJson> {
  const constraint: GithubConstraint = {
    provider: 'github',
    owner: input.owner,
    repo: input.repo,
    pr_number: input.pr_number,
  };
  return runScoped(
    deps,
    '/github/pr/merge',
    constraint,
    {
      method: 'PUT',
      path: `/repos/${input.owner}/${input.repo}/pulls/${input.pr_number}/merge`,
      ...(input.commit_title ? { body: { commit_title: input.commit_title } } : {}),
    },
    { owner: input.owner, repo: input.repo, pr_number: input.pr_number },
  );
}

async function runScoped(
  deps: ToolDeps,
  command: string,
  constraint: GithubConstraint,
  apiCall: ProxyApiCall,
  resourceOverride?: Record<string, unknown>,
): Promise<ToolResultJson> {
  const resource: Record<string, unknown> =
    resourceOverride ??
    (constraint.repo
      ? { owner: constraint.owner, repo: constraint.repo }
      : { owner: constraint.owner });
  let grant;
  try {
    grant = await deps.intent.acquire(
      {
        constraint,
        actions: [command],
        ttlSeconds: 300,
      },
      deps.awaitApproval,
    );
  } catch (err) {
    return { status: 'denied', error: (err as Error).message };
  }
  try {
    const result: ProxyResult = await deps.guard.proxy({
      ucan: grant.ucan,
      command,
      resource,
      context: {},
      apiCall,
    });
    if (!result.allow) {
      return {
        status: 'denied',
        envelopeId: grant.envelopeId,
        decision: {
          allow: false,
          ...(result.decision.reason !== undefined ? { reason: result.decision.reason } : {}),
          receiptId: result.decision.receiptId,
        },
      };
    }
    if (result.error || !result.upstream) {
      return {
        status: 'failed',
        envelopeId: grant.envelopeId,
        decision: { allow: true, receiptId: result.decision.receiptId },
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
    }
    return {
      status: 'allowed',
      envelopeId: grant.envelopeId,
      decision: { allow: true, receiptId: result.decision.receiptId },
      upstream: { status: result.upstream.status, body: result.upstream.body },
    };
  } finally {
    grant[Symbol.dispose]();
  }
}
