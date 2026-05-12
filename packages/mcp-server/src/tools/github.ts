import type { AuthGuard } from '@auto-nomos/sdk';
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

const CreateRepoInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  private: z.boolean().default(true),
  autoInit: z.boolean().optional(),
});
type CreateRepoInput = z.infer<typeof CreateRepoInput>;

const ListReposInput = z.object({
  perPage: z.number().int().min(1).max(100).default(30),
});
type ListReposInput = z.infer<typeof ListReposInput>;

const ListIssuesInput = RepoInput.extend({
  state: z.enum(['open', 'closed', 'all']).default('open'),
  perPage: z.number().int().min(1).max(100).default(30),
});
type ListIssuesInput = z.infer<typeof ListIssuesInput>;

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
  {
    name: 'github_create_repo',
    title: 'Create GitHub repository',
    description:
      'Creates a new GitHub repository under the authenticated user (gated by Credential Broker policy).',
    inputSchema: CreateRepoInput.shape,
    handler: async (guard, raw) => {
      const input: CreateRepoInput = CreateRepoInput.parse(raw);
      return runGuarded(
        guard,
        '/github/repo/create',
        {},
        {
          method: 'POST',
          path: '/user/repos',
          body: {
            name: input.name,
            ...(input.description !== undefined ? { description: input.description } : {}),
            private: input.private,
            ...(input.autoInit !== undefined ? { auto_init: input.autoInit } : {}),
          },
        },
      );
    },
  },
  {
    name: 'github_list_repos',
    title: 'List GitHub repositories',
    description:
      'Lists repositories for the authenticated user (gated by Credential Broker policy).',
    inputSchema: ListReposInput.shape,
    handler: async (guard, raw) => {
      const input: ListReposInput = ListReposInput.parse(raw);
      return runGuarded(
        guard,
        '/github/repo/list',
        {},
        { method: 'GET', path: `/user/repos?per_page=${input.perPage}&sort=updated` },
      );
    },
  },
  {
    name: 'github_list_issues',
    title: 'List GitHub issues',
    description: 'Lists issues in a repository (gated by Credential Broker policy).',
    inputSchema: ListIssuesInput.shape,
    handler: async (guard, raw) => {
      const input: ListIssuesInput = ListIssuesInput.parse(raw);
      return runGuarded(
        guard,
        '/github/issue/list',
        { repo: `${input.owner}/${input.repo}` },
        {
          method: 'GET',
          path: `/repos/${input.owner}/${input.repo}/issues?state=${input.state}&per_page=${input.perPage}`,
        },
      );
    },
  },
];
