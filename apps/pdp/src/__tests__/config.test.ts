import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  it('parses with defaults from empty env', () => {
    const cfg = loadConfig({});
    expect(cfg.PORT).toBe(8787);
    expect(cfg.LOG_LEVEL).toBe('info');
    expect(cfg.NODE_ENV).toBe('development');
  });

  it('coerces PORT to number', () => {
    const cfg = loadConfig({ PORT: '9000' });
    expect(cfg.PORT).toBe(9000);
  });

  it('rejects invalid PORT', () => {
    expect(() => loadConfig({ PORT: '-1' })).toThrow();
    expect(() => loadConfig({ PORT: 'not-a-number' })).toThrow();
  });

  it('rejects unknown LOG_LEVEL', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'banana' })).toThrow();
  });

  it('rejects malformed CONTROL_PLANE_URL', () => {
    expect(() => loadConfig({ CONTROL_PLANE_URL: 'not-a-url' })).toThrow();
  });
});
