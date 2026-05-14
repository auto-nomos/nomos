/**
 * AWS Signature Version 4 — minimal implementation.
 *
 * Used by the AwsCloudProvider to sign arbitrary HTTPS requests against
 * AWS services after STS AssumeRoleWithWebIdentity has yielded short-lived
 * credentials. Spec:
 *   https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
 *
 * Algorithm: AWS4-HMAC-SHA256.
 *
 * No deps beyond node:crypto. Caller supplies method, url, headers, body;
 * we mutate-in a copy and return new headers.
 */
import { createHash, createHmac } from 'node:crypto';

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SigV4SignRequest {
  method: string;
  url: string;
  region: string;
  service: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | undefined;
  now?: Date;
}

export interface SigV4SignResult {
  headers: Record<string, string>;
}

function sha256Hex(input: string | Uint8Array): string {
  const h = createHash('sha256');
  h.update(input);
  return h.digest('hex');
}

function hmacSha256(key: Uint8Array | string, msg: string): Buffer {
  const h = createHmac('sha256', key);
  h.update(msg, 'utf8');
  return h.digest();
}

function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function canonicalQueryString(searchParams: URLSearchParams): string {
  const pairs: Array<[string, string]> = [];
  searchParams.forEach((v, k) => {
    pairs.push([k, v]);
  });
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join('&');
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalUri(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => (seg === '' ? '' : encodeRfc3986(decodeURIComponent(seg))))
    .join('/');
}

function isoDateTime(now: Date): { stamp: string; amzDate: string } {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const yyyy = now.getUTCFullYear();
  const MM = pad(now.getUTCMonth() + 1);
  const dd = pad(now.getUTCDate());
  const HH = pad(now.getUTCHours());
  const mm = pad(now.getUTCMinutes());
  const ss = pad(now.getUTCSeconds());
  const stamp = `${yyyy}${MM}${dd}`;
  return { stamp, amzDate: `${stamp}T${HH}${mm}${ss}Z` };
}

/**
 * Sign a single AWS API request. Returns the headers the caller must
 * attach. `body` defaults to the empty string (UNSIGNED-PAYLOAD is not
 * used here — we always hash the payload).
 */
export function signSigV4(creds: SigV4Credentials, req: SigV4SignRequest): SigV4SignResult {
  const url = new URL(req.url);
  const now = req.now ?? new Date();
  const { stamp, amzDate } = isoDateTime(now);
  const scope = `${stamp}/${req.region}/${req.service}/aws4_request`;

  const bodyBytes =
    req.body instanceof Uint8Array
      ? req.body
      : typeof req.body === 'string'
        ? Buffer.from(req.body, 'utf8')
        : Buffer.alloc(0);
  const payloadHash = sha256Hex(bodyBytes);

  const headers: Record<string, string> = {
    ...(req.headers ?? {}),
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
  if (creds.sessionToken) {
    headers['x-amz-security-token'] = creds.sessionToken;
  }

  const sortedHeaderNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders =
    sortedHeaderNames
      .map((h) => `${h}:${(headers[h] ?? headers[h.toLowerCase()] ?? '').toString().trim()}`)
      .join('\n') + '\n';
  const signedHeaders = sortedHeaderNames.join(';');

  const canonicalRequest = [
    req.method.toUpperCase(),
    canonicalUri(url.pathname || '/'),
    canonicalQueryString(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = deriveSigningKey(creds.secretAccessKey, stamp, req.region, req.service);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { headers };
}
