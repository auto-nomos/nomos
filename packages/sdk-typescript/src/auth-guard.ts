import { parseApiKey } from './api-key.js';
import { type FetchFn, fetchWithRetry } from './transport.js';

export type FailureMode = 'closed' | 'open';

export interface AuthGuardOptions {
  apiKey: string;
  pdpUrl: string;
  failureMode?: FailureMode;
  /** Schema id (optional metadata sent to PDP for routing). */
  schema?: string;
  fetchFn?: FetchFn;
  retry?: { maxAttempts?: number; baseDelayMs?: number };
}

export interface AuthorizeRequestInput {
  ucan: string;
  command: string;
  resource: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface AuthorizeDecision {
  allow: boolean;
  reason?: string;
  obligations?: Record<string, unknown>;
  receiptId: string;
  requiresStepUp?: boolean;
  stepUpUrl?: string;
}

export interface ReceiptInput {
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

export interface AuthGuard {
  readonly customerId: string;
  authorize(req: AuthorizeRequestInput): Promise<AuthorizeDecision>;
  emitReceipt(receiptId: string, input: ReceiptInput): Promise<void>;
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

export function createAuthGuard(opts: AuthGuardOptions): AuthGuard {
  const { customerId } = parseApiKey(opts.apiKey);
  const baseUrl = opts.pdpUrl.replace(/\/+$/, '');
  const failureMode: FailureMode = opts.failureMode ?? 'closed';
  const headers = {
    'content-type': 'application/json',
    'x-cb-customer': customerId,
    authorization: `Bearer ${opts.apiKey}`,
    ...(opts.schema ? { 'x-cb-schema': opts.schema } : {}),
  };

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
  };
}

function isAuthorizeDecision(v: unknown): v is AuthorizeDecision {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.allow === 'boolean' && typeof r.receiptId === 'string';
}
