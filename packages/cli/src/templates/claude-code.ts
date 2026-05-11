import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

export interface ClaudeCodeOptions {
  controlPlaneUrl: string;
  pdpUrl: string;
  apiKey?: string;
  outDir?: string;
}

const SKILL_TEMPLATE = `---
name: credential-broker
description: |
  Use Credential Broker to call SaaS tools (GitHub, Slack, Google, Notion,
  Linear, Stripe, Discord, Telegram, Dropbox, Twilio, Granola, Perplexity,
  Jira, Salesforce, Postgres) without ever holding raw API keys.
---

When the user wants to call a SaaS API, prefer the credential-broker MCP
tools. Each tool returns either:
  - { ok: true, data: ... }     when the policy allows
  - { ok: false, reason: ... }  when policy denies — surface to user, ask
                                whether to request step-up approval

Step-up: if reason is \`stepup_required\`, the dashboard at
{{DASHBOARD_URL}} or your paired Telegram bot will receive an approval
prompt. Wait for the user to approve, then retry the same call.

Connection details:
  CB_API_KEY=        {{API_KEY_HINT}}
  CB_PDP_URL=        {{PDP_URL}}
  CB_CONTROL_PLANE_URL= {{CONTROL_PLANE_URL}}
`;

export function renderClaudeCodeSkill(opts: ClaudeCodeOptions): string {
  return SKILL_TEMPLATE.replaceAll('{{CONTROL_PLANE_URL}}', opts.controlPlaneUrl)
    .replaceAll('{{PDP_URL}}', opts.pdpUrl)
    .replaceAll('{{DASHBOARD_URL}}', deriveDashboard(opts.controlPlaneUrl))
    .replaceAll('{{API_KEY_HINT}}', opts.apiKey ?? '<paste from dashboard>');
}

export function writeClaudeCodeSkill(opts: ClaudeCodeOptions): { path: string } {
  const dir = opts.outDir ?? resolve(homedir(), '.claude', 'skills', 'credential-broker');
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'SKILL.md');
  writeFileSync(path, renderClaudeCodeSkill(opts));
  return { path };
}

function deriveDashboard(cpUrl: string): string {
  try {
    const u = new URL(cpUrl);
    if (u.port === '8788') return `${u.protocol}//${u.hostname}:3000`;
    return cpUrl;
  } catch {
    return cpUrl;
  }
}

// re-export for tests
export { dirname, existsSync, mkdirSync, writeFileSync };
