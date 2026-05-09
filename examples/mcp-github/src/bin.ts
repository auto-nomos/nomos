#!/usr/bin/env node
import { createAuthGuard } from '@credential-broker/sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Octokit } from 'octokit';
import { createMcpGithubServer } from './server.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const apiKey = requireEnv('CB_API_KEY');
  const pdpUrl = process.env.CB_PDP_URL ?? 'http://localhost:8787';
  const ucan = requireEnv('CB_UCAN');
  const githubToken = requireEnv('GITHUB_TOKEN');

  const guard = createAuthGuard({ apiKey, pdpUrl });
  const octokit = new Octokit({ auth: githubToken });
  const server = createMcpGithubServer({ guard, octokit, ucan });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mcp-github ready (stdio)');
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
