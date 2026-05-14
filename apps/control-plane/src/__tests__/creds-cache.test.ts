import type { CloudSessionCreds } from '@auto-nomos/core';
import { describe, expect, it } from 'vitest';
import { createCredsCache, scopeKey } from '../cloud/creds-cache.js';

function azureCreds(
  expiresAt: Date,
  scope = 'https://management.azure.com/.default',
): CloudSessionCreds {
  return { kind: 'azure_bearer', accessToken: 'tok', expiresAt, scope };
}

describe('createCredsCache', () => {
  it('returns undefined on miss', () => {
    const cache = createCredsCache();
    expect(cache.get('c1', 'scope')).toBeUndefined();
  });

  it('stores + retrieves within TTL', () => {
    const now = 1_000_000;
    const cache = createCredsCache({ now: () => now });
    cache.set('c1', 'scope', azureCreds(new Date(now + 600_000)));
    expect(cache.get('c1', 'scope')?.kind).toBe('azure_bearer');
  });

  it('returns undefined after creds expire', () => {
    let now = 1_000_000;
    const cache = createCredsCache({ now: () => now, safetyMarginMs: 0 });
    cache.set('c1', 'scope', azureCreds(new Date(now + 1000)));
    now += 2000;
    expect(cache.get('c1', 'scope')).toBeUndefined();
  });

  it('caps TTL at maxTtlMs even when creds.expiresAt is later', () => {
    let now = 1_000_000;
    const cache = createCredsCache({ now: () => now, maxTtlMs: 100, safetyMarginMs: 0 });
    cache.set('c1', 'scope', azureCreds(new Date(now + 10_000_000)));
    now += 200;
    expect(cache.get('c1', 'scope')).toBeUndefined();
  });

  it('does not cache already-expired creds', () => {
    const now = 1_000_000;
    const cache = createCredsCache({ now: () => now, safetyMarginMs: 0 });
    cache.set('c1', 'scope', azureCreds(new Date(now - 1)));
    expect(cache.get('c1', 'scope')).toBeUndefined();
  });

  it('delete() drops every scope for a connection', () => {
    const cache = createCredsCache();
    // expiry > now + safetyMargin so the entries actually persist.
    const exp = new Date(Date.now() + 10 * 60_000);
    cache.set('c1', 'scope-a', azureCreds(exp, 'scope-a'));
    cache.set('c1', 'scope-b', azureCreds(exp, 'scope-b'));
    cache.set('c2', 'scope-a', azureCreds(exp, 'scope-a'));
    expect(cache.size()).toBe(3);
    cache.delete('c1');
    expect(cache.size()).toBe(1);
    expect(cache.get('c2', 'scope-a')).toBeTruthy();
  });
});

describe('scopeKey', () => {
  it('returns the AAD scope for azure_bearer', () => {
    expect(scopeKey(azureCreds(new Date(), 'my-scope'))).toBe('my-scope');
  });
  it('returns region for aws_sigv4', () => {
    expect(
      scopeKey({
        kind: 'aws_sigv4',
        accessKeyId: 'a',
        secretAccessKey: 'b',
        sessionToken: 'c',
        expiresAt: new Date(),
        region: 'eu-west-1',
      }),
    ).toBe('eu-west-1');
  });
  it('returns cloud-platform for gcp_bearer', () => {
    expect(scopeKey({ kind: 'gcp_bearer', accessToken: 'x', expiresAt: new Date() })).toBe(
      'cloud-platform',
    );
  });
});
