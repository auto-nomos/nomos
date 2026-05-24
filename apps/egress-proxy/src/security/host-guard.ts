/**
 * SSRF host guard for the egress proxy.
 *
 * Audit H6 (2026-05-24): CONNECT handler called `netConnect(port, host)`
 * directly. An attacker who could speak HTTP to the proxy (any agent in
 * proxy mode) could reach internal addresses — AWS/GCP/Azure instance
 * metadata at 169.254.169.254, loopback PDP/CP/Postgres at 127.0.0.1,
 * private VPC ranges — and exfiltrate data or pivot.
 *
 * Defence:
 *   1. Resolve the supplied host once and connect to the resolved literal
 *      address (defeats post-resolve DNS rebind).
 *   2. Reject any address that falls in a reserved/private/loopback/
 *      link-local range.
 *   3. Optional allowlist of host suffixes that bypass step (2) — for
 *      operators that legitimately need to reach an internal endpoint.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type HostGuardReason =
  | 'invalid_host'
  | 'invalid_port'
  | 'dns_lookup_failed'
  | 'host_blocked_loopback'
  | 'host_blocked_private'
  | 'host_blocked_link_local'
  | 'host_blocked_metadata'
  | 'host_blocked_carrier_nat'
  | 'host_blocked_multicast'
  | 'host_blocked_reserved'
  | 'host_blocked_ipv6_mapped'
  | 'dns_rebind_multiple_answers';

export interface HostGuardOptions {
  /** Comma-separated suffix allowlist. Hostnames ending with any entry bypass
   *  the IP-class check (still resolved + connected to the resolved IP). */
  allowlist?: string[];
  /** When true, reject lookups that return >1 address (paranoid mode). */
  pinSingleAnswer?: boolean;
  /** Override for tests. */
  resolver?: (host: string) => Promise<{ address: string; family: 4 | 6 }[]>;
}

export type HostGuardVerdict =
  | { allow: true; resolvedHost: string; family: 4 | 6 }
  | { allow: false; reason: HostGuardReason; detail?: string };

const ALLOWLIST_FROM_ENV = (process.env.EGRESS_ALLOWLIST ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const PIN_DNS_FROM_ENV = process.env.EGRESS_PIN_DNS === 'true';

function matchesAllowlist(host: string, allowlist: string[]): boolean {
  const h = host.toLowerCase();
  return allowlist.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

/** Test a v4 dotted-quad against the reserved ranges in audit H6. */
function classifyV4(ip: string): HostGuardReason | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return 'invalid_host';
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return 'host_blocked_loopback';
  if (a === 10) return 'host_blocked_private';
  if (a === 172 && b >= 16 && b <= 31) return 'host_blocked_private';
  if (a === 192 && b === 168) return 'host_blocked_private';
  if (a === 169 && b === 254) return 'host_blocked_metadata';
  if (a === 100 && b >= 64 && b <= 127) return 'host_blocked_carrier_nat';
  if (a === 0) return 'host_blocked_reserved';
  if (a >= 224) return 'host_blocked_multicast'; // 224/4 + 240/4 + 255.255.255.255
  return null;
}

/** Test a v6 address against the reserved ranges in audit H6. */
function classifyV6(ip: string): HostGuardReason | null {
  const lower = ip.toLowerCase();
  if (lower === '::1') return 'host_blocked_loopback';
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return 'host_blocked_reserved';
  if (lower.startsWith('::ffff:')) return 'host_blocked_ipv6_mapped';
  // fc00::/7 = fc.. or fd..
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return 'host_blocked_private';
  // fe80::/10 = fe8.., fe9.., fea.., feb..
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return 'host_blocked_link_local';
  // ff00::/8 = multicast
  if (lower.startsWith('ff')) return 'host_blocked_multicast';
  return null;
}

/** Public entry point. Returns the resolved literal IP to connect to. */
export async function guardAndResolveHost(
  host: string,
  opts: HostGuardOptions = {},
): Promise<HostGuardVerdict> {
  if (!host || typeof host !== 'string') {
    return { allow: false, reason: 'invalid_host' };
  }

  const allowlist = opts.allowlist ?? ALLOWLIST_FROM_ENV;
  const pinSingle = opts.pinSingleAnswer ?? PIN_DNS_FROM_ENV;

  // If the host is already an IP literal, skip DNS — still classify.
  const literalFamily = isIP(host);
  if (literalFamily === 4 || literalFamily === 6) {
    const reason = literalFamily === 4 ? classifyV4(host) : classifyV6(host);
    if (reason !== null && !matchesAllowlist(host, allowlist)) {
      return { allow: false, reason };
    }
    return { allow: true, resolvedHost: host, family: literalFamily as 4 | 6 };
  }

  let answers: { address: string; family: 4 | 6 }[];
  try {
    const resolver =
      opts.resolver ??
      (async (h: string) => {
        const all = await lookup(h, { all: true });
        return all
          .map((entry) => ({
            address: entry.address,
            family: entry.family as 4 | 6,
          }))
          .filter((entry) => entry.family === 4 || entry.family === 6);
      });
    answers = await resolver(host);
  } catch (err) {
    return { allow: false, reason: 'dns_lookup_failed', detail: (err as Error).message };
  }

  if (answers.length === 0) {
    return { allow: false, reason: 'dns_lookup_failed', detail: 'empty answer set' };
  }
  if (pinSingle && answers.length > 1) {
    return {
      allow: false,
      reason: 'dns_rebind_multiple_answers',
      detail: `host ${host} resolved to ${answers.length} addresses`,
    };
  }

  const first = answers[0]!;
  if (!matchesAllowlist(host, allowlist)) {
    const reason = first.family === 4 ? classifyV4(first.address) : classifyV6(first.address);
    if (reason !== null) {
      return { allow: false, reason, detail: `${host} -> ${first.address}` };
    }
  }
  return { allow: true, resolvedHost: first.address, family: first.family };
}
