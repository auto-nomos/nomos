import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

export interface CursorOptions {
  controlPlaneUrl: string;
  pdpUrl: string;
  apiKey?: string;
  configFilePath?: string;
}

interface CursorMcpConfig {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  [key: string]: unknown;
}

export function defaultCursorConfigPath(): string {
  return resolve(homedir(), '.cursor', 'mcp.json');
}

export function patchCursorConfig(opts: CursorOptions): { path: string; created: boolean } {
  const path = opts.configFilePath ?? defaultCursorConfigPath();
  const existed = existsSync(path);
  let cfg: CursorMcpConfig = {};
  if (existed) {
    const text = readFileSync(path, 'utf8').trim();
    cfg = text.length === 0 ? {} : (JSON.parse(text) as CursorMcpConfig);
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }
  cfg.mcpServers = cfg.mcpServers ?? {};
  const env: Record<string, string> = {
    CB_PDP_URL: opts.pdpUrl,
    CB_CONTROL_PLANE_URL: opts.controlPlaneUrl,
  };
  if (opts.apiKey) env.CB_API_KEY = opts.apiKey;
  cfg.mcpServers['credential-broker'] = {
    command: 'npx',
    args: ['-y', '@auto-nomos/mcp-server'],
    env,
  };
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  return { path, created: !existed };
}
