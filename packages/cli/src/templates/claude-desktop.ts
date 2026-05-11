import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, resolve } from 'node:path';

export interface ClaudeDesktopOptions {
  controlPlaneUrl: string;
  pdpUrl: string;
  apiKey?: string;
  configFilePath?: string;
}

interface ClaudeDesktopConfig {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  [key: string]: unknown;
}

export function defaultClaudeDesktopConfigPath(): string {
  if (platform() === 'darwin') {
    return resolve(
      homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  }
  if (platform() === 'win32') {
    return resolve(process.env.APPDATA ?? homedir(), 'Claude', 'claude_desktop_config.json');
  }
  return resolve(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

export function buildMcpServerEntry(opts: ClaudeDesktopOptions): {
  command: string;
  args: string[];
  env: Record<string, string>;
} {
  const env: Record<string, string> = {
    CB_PDP_URL: opts.pdpUrl,
    CB_CONTROL_PLANE_URL: opts.controlPlaneUrl,
  };
  if (opts.apiKey) env.CB_API_KEY = opts.apiKey;
  return {
    command: 'npx',
    args: ['-y', '@auto-nomos/mcp-server'],
    env,
  };
}

export function patchClaudeDesktopConfig(opts: ClaudeDesktopOptions): {
  path: string;
  created: boolean;
} {
  const path = opts.configFilePath ?? defaultClaudeDesktopConfigPath();
  const existed = existsSync(path);
  let cfg: ClaudeDesktopConfig = {};
  if (existed) {
    const text = readFileSync(path, 'utf8').trim();
    cfg = text.length === 0 ? {} : (JSON.parse(text) as ClaudeDesktopConfig);
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }
  cfg.mcpServers = cfg.mcpServers ?? {};
  cfg.mcpServers['credential-broker'] = buildMcpServerEntry(opts);
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  return { path, created: !existed };
}
