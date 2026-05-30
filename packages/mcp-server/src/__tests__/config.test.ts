import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../config.js';

const VALID_KEY = 'cb_22222222-2222-2222-2222-222222222222_secret';

function tempJson(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'cb-mcp-'));
  const path = join(dir, 'cb-mcp.json');
  writeFileSync(path, JSON.stringify(body));
  return path;
}

describe('loadConfig', () => {
  it('reads --config <file>', () => {
    const path = tempJson({
      apiKey: VALID_KEY,
      pdpUrl: 'https://pdp.test',
      controlPlaneUrl: 'https://api.test',
      integrations: ['github', 'slack'],
    });
    const cfg = loadConfig(['--config', path], {} as NodeJS.ProcessEnv);
    expect(cfg.apiKey).toBe(VALID_KEY);
    expect(cfg.integrations).toEqual(['github', 'slack']);
  });

  it('reads env when no --config given', () => {
    const cfg = loadConfig([], {
      CB_API_KEY: VALID_KEY,
      CB_PDP_URL: 'https://pdp.test',
      CB_CONTROL_PLANE_URL: 'https://api.test',
      CB_INTEGRATIONS: 'github,notion',
    } as NodeJS.ProcessEnv);
    expect(cfg.integrations).toEqual(['github', 'notion']);
  });

  it('reads NOMOS_* env (canonical names)', () => {
    const cfg = loadConfig([], {
      NOMOS_API_KEY: VALID_KEY,
      NOMOS_PDP_URL: 'https://pdp.test',
      NOMOS_CONTROL_URL: 'https://api.test',
      NOMOS_INTEGRATIONS: 'github,linear',
    } as NodeJS.ProcessEnv);
    expect(cfg.apiKey).toBe(VALID_KEY);
    expect(cfg.controlPlaneUrl).toBe('https://api.test');
    expect(cfg.integrations).toEqual(['github', 'linear']);
  });

  it('accepts NOMOS_CONTROL_PLANE_URL as a symmetric alias', () => {
    const cfg = loadConfig([], {
      NOMOS_API_KEY: VALID_KEY,
      NOMOS_PDP_URL: 'https://pdp.test',
      NOMOS_CONTROL_PLANE_URL: 'https://api.test',
    } as NodeJS.ProcessEnv);
    expect(cfg.controlPlaneUrl).toBe('https://api.test');
  });

  it('prefers NOMOS_* over deprecated CB_* when both are set', () => {
    const cfg = loadConfig([], {
      NOMOS_API_KEY: VALID_KEY,
      NOMOS_PDP_URL: 'https://pdp.nomos',
      NOMOS_CONTROL_URL: 'https://api.nomos',
      CB_API_KEY: 'cb_99999999-9999-9999-9999-999999999999_legacy',
      CB_PDP_URL: 'https://pdp.legacy',
      CB_CONTROL_PLANE_URL: 'https://api.legacy',
    } as NodeJS.ProcessEnv);
    expect(cfg.apiKey).toBe(VALID_KEY);
    expect(cfg.pdpUrl).toBe('https://pdp.nomos');
    expect(cfg.controlPlaneUrl).toBe('https://api.nomos');
  });

  it('rejects malformed api keys', () => {
    expect(() =>
      loadConfig([], {
        CB_API_KEY: 'not-a-cb-key',
        CB_PDP_URL: 'https://pdp.test',
        CB_CONTROL_PLANE_URL: 'https://api.test',
        CB_INTEGRATIONS: 'github',
      } as NodeJS.ProcessEnv),
    ).toThrow(ConfigError);
  });

  it('rejects unknown integrations', () => {
    expect(() =>
      loadConfig([], {
        CB_API_KEY: VALID_KEY,
        CB_PDP_URL: 'https://pdp.test',
        CB_CONTROL_PLANE_URL: 'https://api.test',
        CB_INTEGRATIONS: 'mystery-saas',
      } as NodeJS.ProcessEnv),
    ).toThrow(ConfigError);
  });

  it('allows empty integrations — bin.ts will fetch from control plane', () => {
    const cfg = loadConfig([], {
      CB_API_KEY: VALID_KEY,
      CB_PDP_URL: 'https://pdp.test',
      CB_CONTROL_PLANE_URL: 'https://api.test',
    } as NodeJS.ProcessEnv);
    expect(cfg.integrations).toEqual([]);
  });
});
