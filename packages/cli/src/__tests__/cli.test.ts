import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../cli.js';

describe('cli dispatcher', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('prints help for `cb`', async () => {
    await run([]);
    expect(stdoutSpy).toHaveBeenCalled();
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('cb — credential-broker CLI');
  });

  it('prints help for `cb help`', async () => {
    await run(['help']);
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('connect-agent');
  });

  it('prints version', async () => {
    await run(['version']);
    const out = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toMatch(/^cb \d+\.\d+\.\d+/);
  });
});
