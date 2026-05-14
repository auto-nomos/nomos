/**
 * M11 — cloud host awareness for the egress proxy.
 *
 * Full body interception (decrypt → re-encrypt with local CA) is P2.
 * For M11 we ship the lighter defense-in-depth layer:
 *
 *   1. Recognize cloud API hosts from hostname patterns.
 *   2. For CONNECTs to recognized cloud hosts, require a Nomos-PDP
 *      authorization token in the proxy-authorization header. Without
 *      it, deny the CONNECT — agents can't reach the cloud at the
 *      network layer without first going through the PDP.
 *   3. Emit enriched observations with `connector` + `service` parsed
 *      from the host, so audit can correlate egress-proxy entries with
 *      PDP cloud.call events.
 *
 * This is configured via `requireTokenForClouds: true`. When false (dev
 * default), the proxy passes cloud hosts through with the enriched
 * observation but no enforcement.
 */

export type DetectedConnector = 'azure' | 'aws' | 'gcp';

export interface CloudHostMatch {
  connector: DetectedConnector;
  /** Service inferred from host (best-effort). */
  service?: string;
  /** Region inferred from host (AWS regional pattern only). */
  region?: string;
}

const AWS_REGIONAL = /^([a-z][a-z0-9-]+)\.([a-z]{2}-[a-z]+-\d+)\.amazonaws\.com$/;
const AWS_S3_VIRTUAL = /^([^.]+)\.s3\.([a-z]{2}-[a-z]+-\d+)\.amazonaws\.com$/;
const AZURE_HOSTS = new Set([
  'management.azure.com',
  'login.microsoftonline.com',
  'graph.microsoft.com',
]);
const GCP_HOST_SUFFIX = '.googleapis.com';

export function detectCloudHost(hostname: string): CloudHostMatch | null {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'management.azure.com' || host.endsWith('.management.azure.com')) {
    return { connector: 'azure', service: 'arm' };
  }
  if (AZURE_HOSTS.has(host)) {
    const service = host === 'login.microsoftonline.com' ? 'aad' : 'graph';
    return { connector: 'azure', service };
  }
  const arm = host.match(AWS_REGIONAL);
  if (arm) return { connector: 'aws', service: arm[1] ?? undefined, region: arm[2] };
  const s3v = host.match(AWS_S3_VIRTUAL);
  if (s3v) return { connector: 'aws', service: 's3', region: s3v[2] };
  if (host.endsWith('.amazonaws.com')) {
    const segments = host.split('.');
    return { connector: 'aws', service: segments[0] ?? undefined };
  }
  if (host === 'googleapis.com' || host.endsWith(GCP_HOST_SUFFIX)) {
    const segments = host.split('.');
    return { connector: 'gcp', service: segments[0] ?? undefined };
  }
  return null;
}

export interface CloudEnforcementOptions {
  /** When true, deny CONNECTs to recognized cloud hosts that lack the proxy token. */
  requireTokenForClouds?: boolean;
  /** Bearer token PDP includes in proxy-authorization for legitimate egress. */
  expectedToken?: string;
}

export interface EnforcementVerdict {
  allow: boolean;
  reason?: string;
}

export function checkCloudConnect(
  hostname: string,
  proxyAuthHeader: string | undefined,
  opts: CloudEnforcementOptions,
): EnforcementVerdict {
  const match = detectCloudHost(hostname);
  if (!match) return { allow: true };
  if (!opts.requireTokenForClouds) return { allow: true };
  if (!opts.expectedToken) return { allow: true }; // misconfigured = fail-open
  const presented = (proxyAuthHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  if (presented !== opts.expectedToken) {
    return {
      allow: false,
      reason: `cloud_host_requires_pdp_token (connector=${match.connector})`,
    };
  }
  return { allow: true };
}
