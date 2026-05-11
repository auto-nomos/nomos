/**
 * Dynamic per-request scope narrowing — SDK side.
 *
 * `requestIntent()` calls control-plane `/v1/intent` with a structured
 * `ResourceConstraint`. The control plane either mints a short-lived
 * UCAN inside an existing Approval Envelope or returns a step-up deep
 * link the human must approve via passkey. On approval, the SDK calls
 * back with `cosignerJwt` to mint envelope + child UCAN atomically.
 *
 * The returned `Grant` is `Disposable` so callers can use the `using`
 * keyword to scope the UCAN to a code block; on disposal we drop the
 * cached UCAN. Server-side revocation lives on the dashboard "Active
 * grants" page.
 */
import type { FetchFn } from './transport.js';

export type FilesystemConstraint = {
  provider: 'filesystem';
  path_prefix: string;
  host?: string;
};

export type GithubConstraint = {
  provider: 'github';
  owner: string;
  repo?: string;
  ref?: string;
  path_prefix?: string;
  issue_number?: number;
  pr_number?: number;
};

export type ResourceConstraint = FilesystemConstraint | GithubConstraint;

export interface Intent {
  constraint: ResourceConstraint;
  actions: string[];
  ttlSeconds: number;
  /** Free-text declaration of *why* the agent is making this call.
   *  Required when the control plane has the LLM coherence verifier
   *  enabled; otherwise ignored. Length 8..280. */
  purpose?: string;
  /** Optional structured args (recipient, body keys, query params) the
   *  LLM verifier can use for chain-context. */
  requestArgs?: Record<string, unknown>;
}

export interface IntentRequestOptions {
  cosignerJwt?: string;
  parentEnvelopeId?: string;
}

export type IntentResult =
  | {
      kind: 'mint';
      ucan: string;
      envelopeId: string;
      /** Epoch seconds. */
      expiresAt: number;
    }
  | {
      kind: 'stepup';
      stepUpId: string;
      stepUpUrl: string;
      proposedEnvelope: Intent;
    };

export interface Grant extends Disposable {
  ucan: string;
  envelopeId: string;
  /** Epoch seconds. */
  expiresAt: number;
}

export class IntentError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'IntentError';
  }
}

export interface IntentClientOptions {
  controlPlaneUrl: string;
  apiKey: string;
  fetchFn?: FetchFn;
}

export interface IntentClient {
  /**
   * Single-shot intent request. Returns the raw IntentResult so callers
   * can branch on `mint` vs `stepup` (e.g., a CLI prints the deep link;
   * an MCP server polls and retries).
   */
  request(intent: Intent, opts?: IntentRequestOptions): Promise<IntentResult>;

  /**
   * Convenience helper: request → on stepup, poll an approval URL the
   * caller-supplied `awaitApproval` produces a cosigner JWT for, then
   * retry. Returns a Disposable Grant. The caller is expected to wire
   * the dashboard polling via `awaitApproval` (or use AuthGuard's
   * `waitForApproval` and pass its `cosignerJwt`).
   */
  acquire(
    intent: Intent,
    awaitApproval: (stepUpId: string, stepUpUrl: string) => Promise<string>,
  ): Promise<Grant>;
}

export function createIntentClient(opts: IntentClientOptions): IntentClient {
  const baseUrl = opts.controlPlaneUrl.replace(/\/+$/, '');
  const fetchFn = opts.fetchFn ?? fetch;

  async function request(
    intent: Intent,
    options: IntentRequestOptions = {},
  ): Promise<IntentResult> {
    const res = await fetchFn(`${baseUrl}/v1/intent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        intent,
        ...(options.cosignerJwt ? { cosignerJwt: options.cosignerJwt } : {}),
        ...(options.parentEnvelopeId ? { parentEnvelopeId: options.parentEnvelopeId } : {}),
      }),
    });
    if (!res.ok) {
      let errBody: { error?: string; error_code?: string } = {};
      try {
        errBody = (await res.json()) as typeof errBody;
      } catch {
        // ignore
      }
      throw new IntentError(
        errBody.error ?? `intent ${res.status}`,
        errBody.error_code ?? 'intent_failed',
        res.status,
      );
    }
    return (await res.json()) as IntentResult;
  }

  async function acquire(
    intent: Intent,
    awaitApproval: (stepUpId: string, stepUpUrl: string) => Promise<string>,
  ): Promise<Grant> {
    let result = await request(intent);
    if (result.kind === 'stepup') {
      const cosignerJwt = await awaitApproval(result.stepUpId, result.stepUpUrl);
      result = await request(intent, { cosignerJwt });
      if (result.kind !== 'mint') {
        throw new IntentError(
          'second-call stepup unexpected — cosigner JWT was rejected',
          'cosigner_rejected',
          0,
        );
      }
    }
    return makeGrant(result);
  }

  return { request, acquire };
}

function makeGrant(mint: Extract<IntentResult, { kind: 'mint' }>): Grant {
  return {
    ucan: mint.ucan,
    envelopeId: mint.envelopeId,
    expiresAt: mint.expiresAt,
    [Symbol.dispose]() {
      // No server-side revoke on disposal — child UCAN already has a
      // short ttl, and aggressive revoke spam stresses the push channel.
      // Use the dashboard or a separate revoke API for explicit revocation.
    },
  };
}
