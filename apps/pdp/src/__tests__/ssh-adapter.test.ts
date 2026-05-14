import { describe, expect, it } from 'vitest';
import { shQuote, validateHost, validatePathPrefix } from '../adapters/ssh.js';

const constraint = {
  provider: 'ssh' as const,
  host: 'server.example.com',
  port: 22,
  username: 'ops',
  path_prefix: '/srv/app',
};

describe('ssh path-prefix validator', () => {
  it('accepts the prefix root and strict children', () => {
    expect(validatePathPrefix('/srv/app', constraint).ok).toBe(true);
    expect(validatePathPrefix('/srv/app/config.yml', constraint).ok).toBe(true);
    expect(validatePathPrefix('/srv/app/sub/dir/file', constraint).ok).toBe(true);
  });

  it('rejects sibling that shares a string prefix (the historic bug)', () => {
    // /srv/appdata starts with /srv/app — must NOT match.
    expect(validatePathPrefix('/srv/appdata/secret', constraint).ok).toBe(false);
    expect(validatePathPrefix('/srv/application', constraint).ok).toBe(false);
  });

  it('rejects `..` escape', () => {
    expect(validatePathPrefix('/srv/app/../other', constraint).ok).toBe(false);
  });

  it('rejects paths carrying shell-metacharacters', () => {
    expect(validatePathPrefix('/srv/app/$(rm -rf /).txt', constraint).ok).toBe(false);
    expect(validatePathPrefix('/srv/app/`whoami`', constraint).ok).toBe(false);
    expect(validatePathPrefix('/srv/app/${PATH}', constraint).ok).toBe(false);
    expect(validatePathPrefix('/srv/app/a\nb', constraint).ok).toBe(false);
    expect(validatePathPrefix('/srv/app/a\\b', constraint).ok).toBe(false);
  });

  it('passes through with no path_prefix (whole-host access)', () => {
    expect(validatePathPrefix('/anything', { ...constraint, path_prefix: undefined }).ok).toBe(
      true,
    );
  });
});

describe('ssh host validator', () => {
  const base = {
    constraint,
    host: 'server.example.com',
    username: 'ops',
    privateKey: 'fake-key',
  };
  it('matches when host and username align', () => {
    expect(validateHost(base).ok).toBe(true);
  });
  it('rejects on host mismatch', () => {
    const r = validateHost({ ...base, host: 'attacker.example.com' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('host_mismatch');
  });
  it('rejects on username mismatch when constraint pins one', () => {
    const r = validateHost({ ...base, username: 'root' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('username_mismatch');
  });
});

describe('shQuote', () => {
  it('quotes plain strings', () => {
    expect(shQuote('/tmp/foo.txt')).toBe(`'/tmp/foo.txt'`);
  });
  it('neutralises $(...)', () => {
    const q = shQuote('/tmp/$(rm -rf /).txt');
    expect(q).toBe(`'/tmp/$(rm -rf /).txt'`);
  });
  it('escapes embedded single quotes', () => {
    expect(shQuote(`foo'bar`)).toBe(`'foo'\\''bar'`);
  });
});
