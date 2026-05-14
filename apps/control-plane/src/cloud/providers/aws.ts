/**
 * AWS CloudProvider — STS AssumeRoleWithWebIdentity + SigV4 signing.
 *
 *   1. Nomos mints an OIDC ID token with aud="sts.amazonaws.com".
 *   2. POST to sts.{region}.amazonaws.com with Action=AssumeRoleWithWebIdentity
 *      (no SigV4 — STS web-identity is anonymous + token-bearing).
 *   3. STS returns AccessKeyId / SecretAccessKey / SessionToken (~1hr TTL).
 *   4. signAndCall uses SigV4 to sign arbitrary AWS API calls.
 *
 * Regional STS endpoints (sts.{region}.amazonaws.com) are preferred over
 * the global endpoint for latency + outage isolation. GovCloud is a
 * separate variant (sts.{region}.amazonaws.com works there too if the
 * caller's region is gov-).
 */

import type {
  CloudApiRequest,
  CloudApiResponse,
  CloudConnectionRef,
  CloudProvider,
  CloudSessionCreds,
  IdTokenAudience,
} from '@auto-nomos/core';
import { CloudFederationError, signSigV4 } from '@auto-nomos/core';

export interface AwsProviderOptions {
  fetch?: typeof fetch;
  /** Default STS region — used when connection.config.region is unset. */
  defaultRegion?: string;
  /** Override STS host base for tests. */
  stsHostFn?: (region: string) => string;
}

interface AwsConnectionConfig {
  /** IAM role ARN to assume. */
  role_arn?: string;
  /** Optional external id for the trust policy. Not needed for OIDC-trust roles. */
  external_id?: string;
  /** Region for STS + default for signed calls. Defaults to provider default. */
  region?: string;
  /** Optional service name override for signAndCall. Most calls infer from URL. */
  default_service?: string;
}

const AUDIENCE = 'sts.amazonaws.com';

export class AwsCloudProvider implements CloudProvider {
  readonly id = 'aws' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultRegion: string;
  private readonly stsHost: (region: string) => string;

  constructor(opts: AwsProviderOptions = {}) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.defaultRegion = opts.defaultRegion ?? 'us-east-1';
    this.stsHost = opts.stsHostFn ?? ((region: string) => `https://sts.${region}.amazonaws.com`);
  }

  audienceFor(_connection: CloudConnectionRef): IdTokenAudience {
    return { audience: AUDIENCE, ttlSeconds: 300 };
  }

  async acquireSessionCreds(
    connection: CloudConnectionRef,
    idToken: string,
  ): Promise<CloudSessionCreds> {
    if (connection.connector !== 'aws') {
      throw new CloudFederationError('connector_mismatch', 400, {
        connector: connection.connector,
      });
    }
    const config = connection.config as AwsConnectionConfig;
    const roleArn = config.role_arn;
    if (!roleArn) {
      throw new CloudFederationError('missing_role_arn', 400, null);
    }
    const region = config.region ?? this.defaultRegion;
    const params = new URLSearchParams({
      Action: 'AssumeRoleWithWebIdentity',
      Version: '2011-06-15',
      RoleArn: roleArn,
      RoleSessionName: `nomos-${connection.id.slice(0, 16)}`,
      WebIdentityToken: idToken,
    });

    // STS web-identity is unsigned (the token IS the credential).
    const res = await this.fetchImpl(`${this.stsHost(region)}/?${params.toString()}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    const raw = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!res.ok) {
      throw new CloudFederationError(
        `sts_assume_role_failed_${res.status}: ${raw.slice(0, 200)}`,
        res.status,
        raw,
        retryable,
      );
    }
    // STS returns XML by default; force JSON via header was already requested,
    // but if XML comes back parse it minimally for the credential fields.
    const creds = parseStsCredentials(raw);
    if (!creds) {
      throw new CloudFederationError('sts_malformed_response', res.status, raw);
    }
    return {
      kind: 'aws_sigv4',
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiresAt: creds.expiresAt,
      region,
    };
  }

  async signAndCall(creds: CloudSessionCreds, req: CloudApiRequest): Promise<CloudApiResponse> {
    if (creds.kind !== 'aws_sigv4') {
      throw new CloudFederationError('creds_kind_mismatch', 400, { kind: creds.kind });
    }
    const url = absoluteUrlAws(req.url, req.query);
    const { service, region } = inferServiceAndRegion(url, creds.region);
    const body =
      req.body !== undefined
        ? typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body)
        : '';
    const signed = signSigV4(creds, {
      method: req.method,
      url,
      service,
      region,
      headers: {
        accept: 'application/json',
        ...(req.body !== undefined ? { 'content-type': 'application/x-amz-json-1.1' } : {}),
        ...(req.headers ?? {}),
      },
      body,
    });
    const res = await this.fetchImpl(url, {
      method: req.method,
      headers: signed.headers,
      ...(req.body !== undefined ? { body } : {}),
    });
    const text = await res.text();
    let parsed: unknown = text;
    if (text.length > 0 && (res.headers.get('content-type') ?? '').includes('json')) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status: res.status, body: parsed, headers };
  }
}

interface ParsedStsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: Date;
}

/**
 * Parse STS AssumeRoleWithWebIdentity response. STS speaks XML by default
 * for the Action= URL-encoded shape. We extract the four fields we need
 * with regex — full XML parser would be overkill.
 */
function parseStsCredentials(body: string): ParsedStsCreds | null {
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as {
        AssumeRoleWithWebIdentityResponse?: {
          AssumeRoleWithWebIdentityResult?: {
            Credentials?: {
              AccessKeyId?: string;
              SecretAccessKey?: string;
              SessionToken?: string;
              Expiration?: string | number;
            };
          };
        };
      };
      const credsRaw =
        json.AssumeRoleWithWebIdentityResponse?.AssumeRoleWithWebIdentityResult?.Credentials;
      if (
        credsRaw?.AccessKeyId &&
        credsRaw.SecretAccessKey &&
        credsRaw.SessionToken &&
        credsRaw.Expiration !== undefined
      ) {
        return {
          accessKeyId: credsRaw.AccessKeyId,
          secretAccessKey: credsRaw.SecretAccessKey,
          sessionToken: credsRaw.SessionToken,
          expiresAt: new Date(
            typeof credsRaw.Expiration === 'string'
              ? credsRaw.Expiration
              : credsRaw.Expiration * 1000,
          ),
        };
      }
    } catch {
      // fall through to XML parse
    }
  }
  const xmlTag = (tag: string): string | null => {
    const m = trimmed.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? (m[1] ?? null) : null;
  };
  const accessKeyId = xmlTag('AccessKeyId');
  const secretAccessKey = xmlTag('SecretAccessKey');
  const sessionToken = xmlTag('SessionToken');
  const expiration = xmlTag('Expiration');
  if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) return null;
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiresAt: new Date(expiration),
  };
}

function absoluteUrlAws(pathOrUrl: string, query?: Record<string, string>): string {
  if (!pathOrUrl.startsWith('http')) {
    throw new CloudFederationError(
      'aws_relative_url_unsupported',
      400,
      'AWS callers must supply an absolute URL (https://<service>.<region>.amazonaws.com/...)',
    );
  }
  const url = new URL(pathOrUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

/**
 * Infer (service, region) for SigV4 from the host. Pattern:
 *   {service}.{region}.amazonaws.com         (most services)
 *   {service}.amazonaws.com                  (global services — iam, route53)
 *   s3.{region}.amazonaws.com                (S3 regional)
 *   <bucket>.s3.{region}.amazonaws.com       (S3 virtual-hosted)
 * Caller can override via headers['x-amz-target-service'] for ambiguous hosts.
 */
export function inferServiceAndRegion(
  url: string,
  defaultRegion: string,
): { service: string; region: string } {
  const host = new URL(url).hostname.toLowerCase();
  if (!host.endsWith('amazonaws.com')) {
    return { service: 'execute-api', region: defaultRegion };
  }
  // Strip trailing `.amazonaws.com`.
  const head = host.slice(0, -'.amazonaws.com'.length);
  const segs = head.split('.');
  // Look for region as the segment matching `xx-yyy-N` (or gov-/cn-).
  // Region segment patterns:
  //   us-east-1, eu-west-1, ap-southeast-2
  //   us-gov-west-1, us-gov-east-1
  //   cn-north-1, cn-northwest-1
  const regionIdx = segs.findIndex((s) => /^[a-z]{2,3}(-[a-z]+)+-\d+$/i.test(s));
  // Global services like iam.amazonaws.com, route53.amazonaws.com:
  //   head = 'iam'         → segs = ['iam'], regionIdx = -1
  //   service = first non-dualstack segment.
  if (regionIdx === -1) {
    const service = segs.find((s) => s !== 'dualstack') ?? 'execute-api';
    return { service, region: defaultRegion };
  }
  const region = segs[regionIdx] ?? defaultRegion;
  // Service is the segment immediately preceding region, ignoring 'dualstack'.
  // Examples:
  //   sts.us-east-1                      → segs=['sts','us-east-1'], svc=segs[0]='sts'
  //   s3.dualstack.us-east-1             → svc=segs[0]='s3' (segs[1]='dualstack')
  //   bucket.s3.us-east-1                → virtual-hosted → svc='s3'
  //   ec2.dualstack.eu-west-1            → svc='ec2'
  //   sqs.eu-west-1                      → svc='sqs'
  // Walk left from regionIdx; pick the first segment that isn't 'dualstack'.
  let service = 'execute-api';
  for (let i = regionIdx - 1; i >= 0; i--) {
    const s = segs[i];
    if (s && s !== 'dualstack') {
      // S3 virtual-hosted: when service is 's3' but we got here from
      // <bucket>.s3.<region>, prefer 's3' over the bucket name.
      if (i > 0 && segs.slice(0, i).some((x) => x === 's3' || x === 's3')) {
        service = 's3';
      } else {
        service = s;
      }
      break;
    }
  }
  return { service, region };
}
