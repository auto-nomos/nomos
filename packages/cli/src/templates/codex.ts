import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

export interface CodexOptions {
  controlPlaneUrl: string;
  pdpUrl: string;
  apiKey?: string;
  configFilePath?: string;
}

export function defaultCodexConfigPath(): string {
  return resolve(homedir(), '.codex', 'config.toml');
}

function escapeToml(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function patchCodexConfig(opts: CodexOptions): { path: string; created: boolean } {
  const path = opts.configFilePath ?? defaultCodexConfigPath();
  const existed = existsSync(path);
  let body = existed ? readFileSync(path, 'utf8') : '';
  if (!existed) mkdirSync(dirname(path), { recursive: true });

  body = body.replace(/\[mcp_servers\.nomos\][\s\S]*?(?=\n\[|\n*$)/g, '');

  const env: string[] = [
    `CB_CONTROL_PLANE_URL = "${escapeToml(opts.controlPlaneUrl)}"`,
    `CB_PDP_URL = "${escapeToml(opts.pdpUrl)}"`,
  ];
  if (opts.apiKey) env.push(`CB_API_KEY = "${escapeToml(opts.apiKey)}"`);
  const block = [
    '',
    '[mcp_servers.nomos]',
    'command = "npx"',
    'args = ["-y", "@auto-nomos/mcp-server"]',
    '',
    '[mcp_servers.nomos.env]',
    ...env,
    '',
  ].join('\n');
  const out = body.trimEnd() + (body.trim() ? '\n' : '') + block;
  writeFileSync(path, out.trimStart());
  return { path, created: !existed };
}
