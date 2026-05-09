import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

describe('config', () => {
  it('uses local docker postgres defaults when env empty', () => {
    const cfg = loadConfig({});
    expect(cfg.PORT).toBe(8788);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.DATABASE_URL).toContain('localhost:5433');
    expect(cfg.DATABASE_DIRECT_URL).toContain('localhost:5433');
    expect(cfg.CONTROL_PLANE_SERVICE_TOKEN).toBe('dev-shared-token');
  });

  it('reads PORT from env', () => {
    const cfg = loadConfig({ PORT: '9999' });
    expect(cfg.PORT).toBe(9999);
  });

  it('reads DATABASE_URL from env', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://user:pass@db:5432/x' });
    expect(cfg.DATABASE_URL).toBe('postgres://user:pass@db:5432/x');
  });

  it('rejects invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'crazy' })).toThrow();
  });

  it('rejects empty CONTROL_PLANE_SERVICE_TOKEN', () => {
    expect(() => loadConfig({ CONTROL_PLANE_SERVICE_TOKEN: '' })).toThrow();
  });

  it('accepts optional WORKOS_API_KEY when present', () => {
    const cfg = loadConfig({ WORKOS_API_KEY: 'sk_test_xxx' });
    expect(cfg.WORKOS_API_KEY).toBe('sk_test_xxx');
  });

  it('rejects invalid SENTRY_DSN', () => {
    expect(() => loadConfig({ SENTRY_DSN: 'not-a-url' })).toThrow();
  });
});
