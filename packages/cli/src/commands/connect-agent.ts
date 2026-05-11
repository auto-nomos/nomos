import { resolve } from 'node:path';
import { writeChatgptManifest } from '../templates/chatgpt.js';
import { writeClaudeCodeSkill } from '../templates/claude-code.js';
import { patchClaudeDesktopConfig } from '../templates/claude-desktop.js';
import { patchCodexConfig } from '../templates/codex.js';
import { patchCursorConfig } from '../templates/cursor.js';
import { writeCustomBundle } from '../templates/custom.js';

export type AgentClient =
  | 'claude-code'
  | 'claude-desktop'
  | 'cursor'
  | 'codex'
  | 'chatgpt'
  | 'custom';

interface ParsedArgs {
  out?: string;
  cp: string;
  pdp: string;
  apiKey?: string;
  configFile?: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = {
    cp: process.env.CB_CONTROL_PLANE_URL ?? 'http://localhost:8788',
    pdp: process.env.CB_PDP_URL ?? 'http://localhost:8787',
    apiKey: process.env.CB_API_KEY,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if ((a === '--out' || a === '-o') && next) {
      out.out = next;
      i++;
    } else if (a === '--cp' && next) {
      out.cp = next;
      i++;
    } else if (a === '--pdp' && next) {
      out.pdp = next;
      i++;
    } else if (a === '--api-key' && next) {
      out.apiKey = next;
      i++;
    } else if (a === '--config-file' && next) {
      out.configFile = next;
      i++;
    }
  }
  return out;
}

export async function connectAgent(client: AgentClient, args: string[]): Promise<void> {
  const opts = parseArgs(args);
  switch (client) {
    case 'claude-code': {
      const r = writeClaudeCodeSkill({
        controlPlaneUrl: opts.cp,
        pdpUrl: opts.pdp,
        apiKey: opts.apiKey,
        outDir: opts.out,
      });
      console.info(`cb connect-agent claude-code: wrote ${r.path}`);
      console.info('Restart Claude Code to pick up the skill.');
      return;
    }
    case 'claude-desktop': {
      const r = patchClaudeDesktopConfig({
        controlPlaneUrl: opts.cp,
        pdpUrl: opts.pdp,
        apiKey: opts.apiKey,
        configFilePath: opts.configFile,
      });
      console.info(
        `cb connect-agent claude-desktop: ${r.created ? 'created' : 'patched'} ${r.path}`,
      );
      console.info('Restart Claude Desktop to pick up the MCP server.');
      return;
    }
    case 'cursor': {
      const r = patchCursorConfig({
        controlPlaneUrl: opts.cp,
        pdpUrl: opts.pdp,
        apiKey: opts.apiKey,
        configFilePath: opts.configFile,
      });
      console.info(`cb connect-agent cursor: ${r.created ? 'created' : 'patched'} ${r.path}`);
      console.info('Restart Cursor to pick up the MCP server.');
      return;
    }
    case 'codex': {
      const r = patchCodexConfig({
        controlPlaneUrl: opts.cp,
        pdpUrl: opts.pdp,
        apiKey: opts.apiKey,
        configFilePath: opts.configFile,
      });
      console.info(`cb connect-agent codex: ${r.created ? 'created' : 'patched'} ${r.path}`);
      console.info('Restart Codex CLI to pick up the MCP server.');
      return;
    }
    case 'chatgpt': {
      const dir = opts.out ?? resolve(process.cwd(), 'credential-broker-chatgpt');
      const r = writeChatgptManifest({
        controlPlaneUrl: opts.cp,
        pdpUrl: opts.pdp,
        apiKey: opts.apiKey,
        outDir: dir,
      });
      console.info(`cb connect-agent chatgpt: wrote ${r.path}`);
      console.info(
        'Upload the JSON in the GPT Editor → Actions → "Add new action" → Import from URL/Schema.',
      );
      return;
    }
    case 'custom': {
      const dir = opts.out ?? resolve(process.cwd(), 'credential-broker-config');
      const r = writeCustomBundle({
        controlPlaneUrl: opts.cp,
        pdpUrl: opts.pdp,
        apiKey: opts.apiKey,
        outDir: dir,
      });
      console.info(`cb connect-agent custom: wrote ${r.dir}/.cb-mcp.json + README.md`);
      return;
    }
  }
}
