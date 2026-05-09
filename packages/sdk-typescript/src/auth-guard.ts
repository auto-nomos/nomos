import { parseApiKey } from './api-key.js';
import { type FetchFn, fetchWithRetry } from './transport.js';

export type FailureMode = 'closed' | 'open';

export interface AuthGuardOptions {
  apiKey: string;
  pdpUrl: string;
  /**
   * Required for `mintUcan()` — points at the control plane (e.g.
   * https://api.example.com). Optional if the caller only uses
   * `authorize()` / `proxy()` with externally-supplied UCANs.
   */
  controlPlaneUrl?: string;
  failureMode?: FailureMode;
  /** Schema id (optional metadata sent to PDP for routing). */
  schema?: string;
  fetchFn?: FetchFn;
  retry?: { maxAttempts?: number; baseDelayMs?: number };
}

export interface MintedUcan {
  jwt: string;
  cid: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface MintUcanInput {
  commands: string[];
  /** Lifetime in seconds. Defaults to control-plane default (600s). Capped at 3600s. */
  ttlSeconds?: number;
  /**
   * Pin a specific oauth connection. Only needed when the customer has
   * multiple connections for the same connector (e.g. two GitHub orgs).
   */
  oauthConnectionId?: string;
}

export class MintUcanError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MintUcanError';
  }
}

export interface AuthorizeDecision {
  allow: boolean;
  reason?: string;
  obligations?: Record<string, unknown>;
  receiptId: string;
  requiresStepUp?: boolean;
  /** Human-facing approval URL (dashboard /approve/:id deep link). */
  stepUpUrl?: string;
  /** Approval id the SDK polls via `waitForApproval`. */
  stepUpId?: string;
}

export interface AuthorizeRequestInput {
  ucan: string;
  command: string;
  resource: Record<string, unknown>;
  context: Record<string, unknown>;
  /**
   * Sprint 9 — step-up retry. Set on the second authorize call after the
   * user approves; PDP validates the cosigner attestation, injects
   * `context.cosigner = true`, and re-evaluates.
   */
  cosignerJwt?: string;
}

export type StepUpState = 'pending' | 'approved' | 'denied' | 'expired';

export interface StepUpStatus {
  id: string;
  state: StepUpState;
  command: string;
  resource: unknown;
  expiresAt: string;
  decidedAt: string | null;
  cosignerJwt: string | null;
}

export interface WaitForApprovalInput {
  stepUpId: string;
  /** Total wait. Default 60s. */
  timeoutMs?: number;
  /** Poll cadence. Default 1s. */
  pollIntervalMs?: number;
}

export interface ReceiptInput {
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

export interface ProxyApiCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ProxyResult {
  /**
   * Whether the PDP allowed the call. When false, the PDP did NOT make the
   * upstream request — this carries the same shape as authorize() for parity
   * but with no `upstream` block.
   */
  allow: boolean;
  decision: AuthorizeDecision;
  /** Present only when allow=true and the upstream call ran. */
  upstream?: { status: number; body: unknown; headers: Record<string, string> };
  /** Set when the PDP allowed the request but the proxy/upstream step failed. */
  error?: string;
  /** Provider id (github / slack / google / notion) on success. */
  connector?: string;
}

export interface ProxyInput extends AuthorizeRequestInput {
  apiCall: ProxyApiCall;
}

export interface AuthGuard {
  readonly customerId: string;
  authorize(req: AuthorizeRequestInput): Promise<AuthorizeDecision>;
  emitReceipt(receiptId: string, input: ReceiptInput): Promise<void>;
  /**
   * Trades the configured API key for short-lived UCANs (one per command).
   * Caches results in memory and refreshes when remaining TTL drops below
   * 60s. Requires `controlPlaneUrl` in `AuthGuardOptions`.
   */
  mintUcan(input: MintUcanInput): Promise<Map<string, MintedUcan>>;
  /**
   * Sprint 5.5 — proxy mode. Sends UCAN + apiCall to the PDP's
   * `/v1/proxy/:command`; the PDP runs authorize and, on allow, calls the
   * upstream SaaS with the customer's OAuth token. The agent never sees the
   * upstream token.
   *
   * Failure semantics mirror `authorize()`: PDP unreachable / 5xx falls
   * back to the configured failureMode and surfaces a synthetic decision.
   */
  proxy(req: ProxyInput): Promise<ProxyResult>;
  /**
   * Sprint 9 — polls `GET /v1/stepup/:id` until the user approves/denies
   * the step-up or the timeout fires. On `approved`, the response carries
   * the cosigner attestation JWT the agent then passes back to
   * `authorize({ ..., cosignerJwt })`.
   */
  waitForApproval(input: WaitForApprovalInput): Promise<StepUpStatus>;
}

const FAIL_CLOSED: AuthorizeDecision = {
  allow: false,
  reason: 'pdp_unreachable',
  receiptId: 'sdk-fail-closed',
};

const FAIL_OPEN: AuthorizeDecision = {
  allow: true,
  reason: 'pdp_unreachable_failopen',
  receiptId: 'sdk-fail-open',
};

/**
 * Refresh a cache entry whose remaining TTL has fallen below this many
 * milliseconds. Picked so a 600s default UCAN refreshes at the 540s mark —
 * plenty of slack for clock skew + network jitter.
 */
const REFRESH_BEFORE_MS = 60_000;

export function createAuthGuard(opts: AuthGuardOptions): AuthGuard {
  const { customerId } = parseApiKey(opts.apiKey);
  const baseUrl = opts.pdpUrl.replace(/\/+$/, '');
  const controlPlaneUrl = opts.controlPlaneUrl?.replace(/\/+$/, '');
  const failureMode: FailureMode = opts.failureMode ?? 'closed';
  const headers = {
    'content-type': 'application/json',
    'x-cb-customer': customerId,
    authorization: `Bearer ${opts.apiKey}`,
    ...(opts.schema ? { 'x-cb-schema': opts.schema } : {}),
  };

  // Cache UCANs by command. mintUcan refreshes any entry whose remaining
  // TTL is below REFRESH_BEFORE_MS.
  const ucanCache = new Map<string, MintedUcan>();

  return {
    customerId,
    async authorize(req) {
      let res: Response;
      try {
        res = await fetchWithRetry(
          `${baseUrl}/v1/authorize`,
          { method: 'POST', headers, body: JSON.stringify(req) },
          { ...(opts.fetchFn !== undefined ? { fetchFn: opts.fetchFn } : {}), ...opts.retry },
        );
      } catch {
        return failureMode === 'open' ? FAIL_OPEN : FAIL_CLOSED;
      }

      if (res.status >= 500) {
        return failureMode === 'open' ? FAIL_OPEN : FAIL_CLOSED;
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return {
          allow: failureMode === 'open',
          reason: 'pdp_invalid_response',
          receiptId: 'sdk-invalid-response',
        };
      }

      if (!isAuthorizeDecision(body)) {
        return {
          allow: failureMode === 'open',
          reason: 'pdp_invalid_response',
          receiptId: 'sdk-invalid-response',
        };
      }
      return body;
    },

    async emitReceipt(receiptId, input) {
      const res = await fetchWithRetry(
        `${baseUrl}/v1/receipts`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ receiptId, ...input }),
        },
        { ...(opts.fetchFn !== undefined ? { fetchFn: opts.fetchFn } : {}), ...opts.retry },
      );
      if (!res.ok) {
        throw new Error(`receipt rejected: HTTP ${res.status}`);
      }
    },

    async mintUcan(input) {
      if (!controlPlaneUrl) {
        throw new MintUcanError(
          'mintUcan requires controlPlaneUrl in AuthGuardOptions',
          'control_plane_url_missing',
          0,
        );
      }
      const now = Date.now();
      const stale: string[] = [];
      const fresh = new Map<string, MintedUcan>();
      for (const command of input.commands) {
        const cached = ucanCache.get(command);
        if (cached && cached.expiresAt - now > REFRESH_BEFORE_MS) {
          fresh.set(command, cached);
        } else {
          stale.push(command);
        }
      }
      if (stale.length === 0) {
        return fresh;
      }

      const fetchFn = opts.fetchFn ?? fetch;
      const res = await fetchFn(`${controlPlaneUrl}/v1/mint-ucan`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          commands: stale,
          ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
          ...(input.oauthConnectionId !== undefined
            ? { oauthConnectionId: input.oauthConnectionId }
            : {}),
        }),
      });
      if (!res.ok) {
        let errBody: { error?: string; error_code?: string } = {};
        try {
          errBody = (await res.json()) as typeof errBody;
        } catch {
          // ignore — body may be empty
        }
        throw new MintUcanError(
          errBody.error ?? `mint-ucan ${res.status}`,
          errBody.error_code ?? 'mint_failed',
          res.status,
        );
      }
      const body = (await res.json()) as {
        ucans: Array<{ command: string; jwt: string; cid: string; expiresAt: string }>;
      };
      for (const u of body.ucans) {
        const minted: MintedUcan = {
          jwt: u.jwt,
          cid: u.cid,
          expiresAt: Date.parse(u.expiresAt),
        };
        ucanCache.set(u.command, minted);
        fresh.set(u.command, minted);
      }
      return fresh;
    },

    async waitForApproval(input) {
      const timeoutMs = input.timeoutMs ?? 60_000;
      const pollIntervalMs = input.pollIntervalMs ?? 1_000;
      const fetchFn = opts.fetchFn ?? fetch;
      const deadline = Date.now() + timeoutMs;
      const url = `${baseUrl}/v1/stepup/${encodeURIComponent(input.stepUpId)}`;
      while (true) {
        let res: Response;
        try {
          res = await fetchFn(url, { headers });
        } catch {
          // Transient — retry until deadline.
          if (Date.now() >= deadline) {
            return makeExpired(input.stepUpId);
          }
          await sleep(pollIntervalMs);
          continue;
        }
        if (res.status === 404) {
          return makeExpired(input.stepUpId);
        }
        if (!res.ok) {
          if (Date.now() >= deadline) return makeExpired(input.stepUpId);
          await sleep(pollIntervalMs);
          continue;
        }
        const body = (await res.json().catch(() => null)) as
          | (Omit<StepUpStatus, 'cosignerJwt'> & { cosignerJwt: string | null })
          | null;
        if (!body || typeof body !== 'object') {
          if (Date.now() >= deadline) return makeExpired(input.stepUpId);
          await sleep(pollIntervalMs);
          continue;
        }
        if (body.state !== 'pending') {
          return body as StepUpStatus;
        }
        if (Date.now() >= deadline) {
          return { ...(body as StepUpStatus), state: 'expired' };
        }
        await sleep(pollIntervalMs);
      }
    },

    async proxy(req) {
      const { apiCall, ...authReq } = req;
      const path = `${baseUrl}/v1/proxy${authReq.command}`;
      const failClosedDecision = failureMode === 'open' ? FAIL_OPEN : FAIL_CLOSED;
      let res: Response;
      try {
        res = await fetchWithRetry(
          path,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ ucan: authReq.ucan, request: authReq, apiCall }),
          },
          { ...(opts.fetchFn !== undefined ? { fetchFn: opts.fetchFn } : {}), ...opts.retry },
        );
      } catch {
        return { allow: failClosedDecision.allow, decision: failClosedDecision };
      }
      if (res.status >= 500) {
        return { allow: failClosedDecision.allow, decision: failClosedDecision };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return {
          allow: false,
          decision: {
            allow: false,
            reason: 'pdp_invalid_response',
            receiptId: 'sdk-invalid-response',
          },
        };
      }
      return parseProxyResponse(body);
    },
  };
}

function parseProxyResponse(body: unknown): ProxyResult {
  if (typeof body !== 'object' || body === null) {
    return {
      allow: false,
      decision: {
        allow: false,
        reason: 'pdp_invalid_response',
        receiptId: 'sdk-invalid-response',
      },
    };
  }
  const r = body as Record<string, unknown>;
  if (!isAuthorizeDecision(r.decision)) {
    return {
      allow: false,
      decision: {
        allow: false,
        reason: 'pdp_invalid_response',
        receiptId: 'sdk-invalid-response',
      },
    };
  }
  return {
    allow: typeof r.allow === 'boolean' ? r.allow : r.decision.allow,
    decision: r.decision,
    ...(typeof r.upstream === 'object' && r.upstream !== null
      ? { upstream: r.upstream as ProxyResult['upstream'] }
      : {}),
    ...(typeof r.error === 'string' ? { error: r.error } : {}),
    ...(typeof r.connector === 'string' ? { connector: r.connector } : {}),
  };
}

function isAuthorizeDecision(v: unknown): v is AuthorizeDecision {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.allow === 'boolean' && typeof r.receiptId === 'string';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeExpired(stepUpId: string): StepUpStatus {
  return {
    id: stepUpId,
    state: 'expired',
    command: '',
    resource: null,
    expiresAt: new Date().toISOString(),
    decidedAt: null,
    cosignerJwt: null,
  };
}
