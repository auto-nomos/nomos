import type { AuthGuard } from '@credential-broker/sdk';
import { z } from 'zod';
import { runGuarded, type ToolResultJson } from '../run-guarded.js';
import type { ToolDefinition } from './types.js';

const RepoInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});
type RepoInput = z.infer<typeof RepoInput>;

const ReadUserInput = z.object({});

const CreateIssueInput = RepoInput.extend({
  title: z.string().min(1),
  body: z.string().optional(),
});
type CreateIssueInput = z.infer<typeof CreateIssueInput>;

const MergePrInput = RepoInput.extend({
  prNumber: z.number().int().positive(),
});
type MergePrInput = z.infer<typeof MergePrInput>;

export const githubTools: ToolDefinition[] = [
  {
    name: 'github_read_user',
    title: 'Read GitHub user',
    description: 'Reads the authenticated GitHub user (gated by Credential Broker policy).',
    inputSchema: ReadUserInput.shape,
    handler: async (guard: AuthGuard): Promise<ToolResultJson> =>
      runGuarded(guard, '/github/user/read', {}, { method: 'GET', path: '/user' }),
  },
  {
    name: 'github_read_repo',
    title: 'Read GitHub repository',
    description:
      'Reads basic metadata for a GitHub repository (gated by Credential Broker policy).',
    inputSchema: RepoInput.shape,
    handler: async (guard, raw) => {
      const input: RepoInput = RepoInput.parse(raw);
      return runGuarded(
        guard,
        '/github/repo/read',
        { repo: `${input.owner}/${input.repo}` },
        { method: 'GET', path: `/repos/${input.owner}/${input.repo}` },
      );
    },
  },
  {
    name: 'github_create_issue',
    title: 'Create GitHub issue',
    description: 'Creates an issue in a repository (gated by Credential Broker policy).',
    inputSchema: CreateIssueInput.shape,
    handler: async (guard, raw) => {
      const input: CreateIssueInput = CreateIssueInput.parse(raw);
      return runGuarded(
        guard,
        '/github/issue/create',
        { repo: `${input.owner}/${input.repo}` },
        {
          method: 'POST',
          path: `/repos/${input.owner}/${input.repo}/issues`,
          body: {
            title: input.title,
            ...(input.body !== undefined ? { body: input.body } : {}),
          },
        },
      );
    },
  },
  {
    name: 'github_merge_pr',
    title: 'Merge GitHub pull request',
    description: 'Merges a pull request (gated by Credential Broker policy).',
    inputSchema: MergePrInput.shape,
    handler: async (guard, raw) => {
      const input: MergePrInput = MergePrInput.parse(raw);
      return runGuarded(
        guard,
        '/github/pr/merge',
        { repo: `${input.owner}/${input.repo}`, pr: input.prNumber },
        {
          method: 'PUT',
          path: `/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}/merge`,
        },
      );
    },
  },
];
