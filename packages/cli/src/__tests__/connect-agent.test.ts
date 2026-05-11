import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderChatgptManifest, writeChatgptManifest } from '../templates/chatgpt.js';
import { renderClaudeCodeSkill, writeClaudeCodeSkill } from '../templates/claude-code.js';
import { buildMcpServerEntry, patchClaudeDesktopConfig } from '../templates/claude-desktop.js';
import { patchCursorConfig } from '../templates/cursor.js';
import { writeCustomBundle } from '../templates/custom.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), 'cb-cli-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('claude-code skill', () => {
  it('renders skill body with substitutions', () => {
    const out = renderClaudeCodeSkill({
      controlPlaneUrl: 'https://cp.example.com',
      pdpUrl: 'https://pdp.example.com',
      apiKey: 'cb_xxx',
    });
    expect(out).toContain('https://cp.example.com');
    expect(out).toContain('https://pdp.example.com');
    expect(out).toContain('cb_xxx');
  });

  it('writes SKILL.md to outDir', () => {
    const r = writeClaudeCodeSkill({
      controlPlaneUrl: 'http://localhost:8788',
      pdpUrl: 'http://localhost:8787',
      outDir: resolve(tmp, 'skills/credential-broker'),
    });
    expect(r.path.endsWith('SKILL.md')).toBe(true);
    expect(readFileSync(r.path, 'utf8')).toContain('credential-broker');
  });
});

describe('claude-desktop config patch', () => {
  it('builds an mcpServer entry with env', () => {
    const e = buildMcpServerEntry({
      controlPlaneUrl: 'http://cp:8788',
      pdpUrl: 'http://pdp:8787',
      apiKey: 'cb_test',
    });
    expect(e.command).toBe('npx');
    expect(e.env.CB_API_KEY).toBe('cb_test');
    expect(e.env.CB_PDP_URL).toBe('http://pdp:8787');
  });

  it('creates a config when none exists', () => {
    const path = resolve(tmp, 'claude_desktop_config.json');
    const r = patchClaudeDesktopConfig({
      controlPlaneUrl: 'http://localhost:8788',
      pdpUrl: 'http://localhost:8787',
      configFilePath: path,
    });
    expect(r.created).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    expect(parsed.mcpServers['credential-broker'].command).toBe('npx');
  });

  it('preserves existing mcpServers when patching', () => {
    const path = resolve(tmp, 'claude_desktop_config.json');
    writeFileSync(path, JSON.stringify({ mcpServers: { other: { command: 'foo' } } }, null, 2));
    const r = patchClaudeDesktopConfig({
      controlPlaneUrl: 'http://localhost:8788',
      pdpUrl: 'http://localhost:8787',
      configFilePath: path,
    });
    expect(r.created).toBe(false);
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    expect(parsed.mcpServers.other.command).toBe('foo');
    expect(parsed.mcpServers['credential-broker']).toBeDefined();
  });

  it('handles empty config file gracefully', () => {
    const path = resolve(tmp, 'claude_desktop_config.json');
    writeFileSync(path, '');
    const r = patchClaudeDesktopConfig({
      controlPlaneUrl: 'http://localhost:8788',
      pdpUrl: 'http://localhost:8787',
      configFilePath: path,
    });
    expect(r.created).toBe(false);
    expect(JSON.parse(readFileSync(path, 'utf8')).mcpServers['credential-broker']).toBeDefined();
  });
});

describe('cursor config patch', () => {
  it('creates mcp.json entry', () => {
    const path = resolve(tmp, 'mcp.json');
    const r = patchCursorConfig({
      controlPlaneUrl: 'http://localhost:8788',
      pdpUrl: 'http://localhost:8787',
      configFilePath: path,
    });
    expect(r.created).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    expect(parsed.mcpServers['credential-broker']).toBeDefined();
  });
});

describe('chatgpt manifest', () => {
  it('emits valid OpenAPI 3.1', () => {
    const text = renderChatgptManifest({
      controlPlaneUrl: 'http://localhost:8788',
      pdpUrl: 'http://localhost:8787',
      outDir: tmp,
    });
    const parsed = JSON.parse(text);
    expect(parsed.openapi).toBe('3.1.0');
    expect(parsed.servers[0].url).toBe('http://localhost:8787');
    expect(parsed.paths['/v1/proxy/{integration}/{action}']).toBeDefined();
  });

  it('writes file', () => {
    const r = writeChatgptManifest({
      controlPlaneUrl: 'http://localhost:8788',
      pdpUrl: 'http://localhost:8787',
      outDir: tmp,
    });
    expect(existsSync(r.path)).toBe(true);
  });
});

describe('custom bundle', () => {
  it('writes .cb-mcp.json + README', () => {
    const r = writeCustomBundle({
      controlPlaneUrl: 'http://localhost:8788',
      pdpUrl: 'http://localhost:8787',
      apiKey: 'cb_demo',
      outDir: tmp,
    });
    const cfg = JSON.parse(readFileSync(resolve(r.dir, '.cb-mcp.json'), 'utf8'));
    expect(cfg.apiKey).toBe('cb_demo');
    expect(existsSync(resolve(r.dir, 'README.md'))).toBe(true);
  });
});
