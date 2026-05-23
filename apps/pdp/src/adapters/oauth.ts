/**
 * PDP-side OAuth proxy adapter (Sprint 5.5).
 *
 * Given an allow decision + a UCAN carrying `meta.oauth_connection_id`, the
 * PDP fetches the upstream access token from the control plane (the only
 * place that can decrypt it), then makes the SaaS call on behalf of the
 * agent. The agent never holds the upstream token — that is the wedge.
 *
 * Per-provider routing is intentionally thin here: only the API base URL +
 * a small set of static headers needed for vanity / versioning. The full
 * connector code in `apps/control-plane/src/oauth/connectors/*` owns the
 * OAuth lifecycle (authorize / exchange / refresh); the PDP only needs a
 * bearer fetch that respects each provider's expectations. Sprint 10
 * unifies these via schema packs.
 */

export type ProviderId = 'github' | 'slack' | 'google' | 'notion' | 'linear' | 'stripe' | 'discord';

export interface ProviderApiConfig {
  base: string;
  staticHeaders?: Record<string, string>;
  /**
   * Slack accepts JSON request bodies but expects `content-type:
   * application/json; charset=utf-8`; everything else is plain `application/json`.
   * Stripe expects `application/x-www-form-urlencoded` — encoded inline below.
   */
  jsonContentType?: string;
  /** Stripe-style form encoding for request bodies. Default JSON. */
  bodyEncoding?: 'json' | 'form';
  /**
   * Auth header scheme. Default `Bearer`. Discord uses `Bot <token>` for
   * bot-token calls; everyone else is `Bearer <token>`.
   */
  authScheme?: 'Bearer' | 'Bot';
}

export const PROVIDER_API: Record<ProviderId, ProviderApiConfig> = {
  github: {
    base: 'https://api.github.com',
    staticHeaders: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'credential-broker-pdp',
    },
  },
  slack: {
    base: 'https://slack.com/api',
    jsonContentType: 'application/json; charset=utf-8',
  },
  google: { base: 'https://www.googleapis.com/drive/v3' },
  notion: {
    base: 'https://api.notion.com/v1',
    staticHeaders: { 'notion-version': '2022-06-28' },
  },
  linear: {
    // Linear's API is GraphQL-only — callers POST to /graphql with a
    // JSON body of `{ query, variables }`.
    base: 'https://api.linear.app',
  },
  stripe: {
    base: 'https://api.stripe.com',
    bodyEncoding: 'form',
  },
  discord: {
    base: 'https://discord.com/api/v10',
    authScheme: 'Bot',
    jsonContentType: 'application/json; charset=utf-8',
    staticHeaders: {
      'user-agent': 'NomosBroker (https://auto-nomos.com, 1.0)',
    },
  },
};

export interface ProxyRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ProxyResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface ProxyAdapterDeps {
  fetch?: typeof fetch;
}

export function isKnownProvider(id: string): id is ProviderId {
  return (
    id === 'github' ||
    id === 'slack' ||
    id === 'google' ||
    id === 'notion' ||
    id === 'linear' ||
    id === 'stripe' ||
    id === 'discord'
  );
}

export async function proxyApiCall(
  provider: ProviderId,
  accessToken: string,
  req: ProxyRequest,
  deps: ProxyAdapterDeps = {},
): Promise<ProxyResponse> {
  const cfg = PROVIDER_API[provider];
  const url = new URL(`${cfg.base}${req.path}`);
  if (req.query) {
    for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {
    authorization: `${cfg.authScheme ?? 'Bearer'} ${accessToken}`,
    accept: 'application/json',
    ...(cfg.staticHeaders ?? {}),
    ...(req.headers ?? {}),
  };
  let body: string | undefined;
  if (req.body !== undefined && req.method !== 'GET' && req.method !== 'DELETE') {
    if (cfg.bodyEncoding === 'form') {
      body = encodeFormBody(req.body);
      headers['content-type'] = 'application/x-www-form-urlencoded';
    } else {
      body = JSON.stringify(req.body);
      headers['content-type'] = cfg.jsonContentType ?? 'application/json';
    }
  }
  const f = deps.fetch ?? globalThis.fetch;
  const res = await f(url.toString(), { method: req.method, headers, body });
  const text = await res.text();
  let parsed: unknown = text;
  if (text.length > 0 && (res.headers.get('content-type') ?? '').includes('json')) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  const headerObj: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headerObj[k] = v;
  });
  return { status: res.status, body: parsed, headers: headerObj };
}

/** Stripe-style URL-encoded form bodies with bracket notation for one
 *  level of nesting. Anything deeper is the caller's responsibility. */
function encodeFormBody(body: unknown): string {
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
        if (nv === undefined || nv === null) continue;
        params.append(`${k}[${nk}]`, String(nv));
      }
    } else if (Array.isArray(v)) {
      for (const item of v) params.append(`${k}[]`, String(item));
    } else {
      params.append(k, String(v));
    }
  }
  return params.toString();
}
