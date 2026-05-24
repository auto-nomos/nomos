/**
 * Audit H6 (2026-05-24) — pin the SSRF guard against every reserved range
 * the original finding called out. Tests pass a stub resolver so they run
 * without DNS — but the literal-IP path also fires the same classifier.
 */
import { describe, expect, it } from 'vitest';
import { guardAndResolveHost } from '../security/host-guard.js';

const stubResolver =
  (entries: { address: string; family: 4 | 6 }[]) =>
  async (_host: string): Promise<{ address: string; family: 4 | 6 }[]> =>
    entries;

describe('host-guard SSRF deny', () => {
  it('blocks AWS/GCP/Azure metadata endpoint', async () => {
    const verdict = await guardAndResolveHost('169.254.169.254');
    expect(verdict).toEqual({ allow: false, reason: 'host_blocked_metadata' });
  });

  it('blocks loopback (127.x and ::1)', async () => {
    const v4 = await guardAndResolveHost('127.0.0.1');
    expect(v4).toEqual({ allow: false, reason: 'host_blocked_loopback' });
    const v6 = await guardAndResolveHost('::1');
    expect(v6).toEqual({ allow: false, reason: 'host_blocked_loopback' });
  });

  it('blocks RFC1918 private ranges', async () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
      const verdict = await guardAndResolveHost(ip);
      expect(verdict.allow, `${ip} should be blocked`).toBe(false);
      if (!verdict.allow) {
        expect(verdict.reason).toBe('host_blocked_private');
      }
    }
  });

  it('blocks 100.64/10 carrier-grade NAT', async () => {
    const verdict = await guardAndResolveHost('100.64.1.1');
    expect(verdict).toEqual({ allow: false, reason: 'host_blocked_carrier_nat' });
  });

  it('blocks 0/8 and multicast 224/4', async () => {
    expect((await guardAndResolveHost('0.0.0.0')).allow).toBe(false);
    expect((await guardAndResolveHost('224.0.0.1')).allow).toBe(false);
  });

  it('blocks IPv6 ULA fc00::/7 and link-local fe80::/10', async () => {
    expect((await guardAndResolveHost('fc00::1')).allow).toBe(false);
    expect((await guardAndResolveHost('fd12:3456:789a::1')).allow).toBe(false);
    expect((await guardAndResolveHost('fe80::1')).allow).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 (::ffff:127.0.0.1)', async () => {
    const verdict = await guardAndResolveHost('::ffff:127.0.0.1');
    expect(verdict).toEqual({ allow: false, reason: 'host_blocked_ipv6_mapped' });
  });

  it('blocks DNS that resolves to metadata IP', async () => {
    const verdict = await guardAndResolveHost('attacker.example.com', {
      resolver: stubResolver([{ address: '169.254.169.254', family: 4 }]),
    });
    expect(verdict.allow).toBe(false);
    if (!verdict.allow) {
      expect(verdict.reason).toBe('host_blocked_metadata');
    }
  });

  it('allows DNS that resolves to a public IP and returns the resolved literal', async () => {
    const verdict = await guardAndResolveHost('example.com', {
      resolver: stubResolver([{ address: '93.184.216.34', family: 4 }]),
    });
    expect(verdict).toEqual({ allow: true, resolvedHost: '93.184.216.34', family: 4 });
  });

  it('pinSingleAnswer rejects multi-answer DNS to defeat rebind', async () => {
    const verdict = await guardAndResolveHost('rebind.example.com', {
      pinSingleAnswer: true,
      resolver: stubResolver([
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ]),
    });
    expect(verdict.allow).toBe(false);
    if (!verdict.allow) {
      expect(verdict.reason).toBe('dns_rebind_multiple_answers');
    }
  });

  it('allowlist bypasses IP-class rejection (suffix match)', async () => {
    const verdict = await guardAndResolveHost('postgres.internal', {
      allowlist: ['internal'],
      resolver: stubResolver([{ address: '10.0.5.7', family: 4 }]),
    });
    expect(verdict).toEqual({ allow: true, resolvedHost: '10.0.5.7', family: 4 });
  });

  it('allows ordinary public IP literals', async () => {
    const verdict = await guardAndResolveHost('1.1.1.1');
    expect(verdict).toEqual({ allow: true, resolvedHost: '1.1.1.1', family: 4 });
  });

  it('rejects empty / malformed host', async () => {
    expect((await guardAndResolveHost('')).allow).toBe(false);
  });
});
