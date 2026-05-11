/**
 * LLM coherence verifier for /v1/intent.
 *
 * Catches semantic drift inside an envelope-covered request. The
 * heuristic classifier checks structural fences (write verbs, deny-listed
 * paths). This module asks an LLM whether the requested actions, on the
 * declared resource, are coherent with the operator's stated purpose.
 *
 * Example: envelope says "send email to bob@x.com about Q3 deck". Agent
 * calls `mail/send` to carol@y.com. Heuristics pass (envelope covers
 * `mail/send`). LLM should return `{coherent: false}` and force step-up.
 *
 * Fail-closed: any timeout, fetch error, malformed JSON, or unknown
 * shape → `{coherent: false, reason: 'llm_<kind>'}`. Aligns with the
 * fail-closed default in feedback_sdk_failure_mode.md.
 *
 * No SDK dependency — uses Anthropic Messages API over fetch. Hard
 * timeout via AbortController.
 */
import type { ResourceConstraint } from '@auto-nomos/shared-types';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_ID = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 128;

export interface CoherenceInput {
  purpose: string;
  constraint: ResourceConstraint;
  actions: string[];
  /** Optional request-level args (recipient, body, query) the verifier
   *  uses for chain-context. Omit if unavailable. */
  requestArgs?: Record<string, unknown>;
}

export interface CoherenceResult {
  coherent: boolean;
  reason?: string;
}

export interface CoherenceVerifierDeps {
  apiKey: string;
  /** Hard timeout in milliseconds. */
  timeoutMs: number;
  fetch?: typeof fetch;
}

export type CoherenceVerifier = (input: CoherenceInput) => Promise<CoherenceResult>;

export function createCoherenceVerifier(deps: CoherenceVerifierDeps): CoherenceVerifier {
  const f = deps.fetch ?? globalThis.fetch;
  return async function verify(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
    try {
      const res = await f(ANTHROPIC_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': deps.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL_ID,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserMessage(input) }],
        }),
      });
      if (!res.ok) {
        return { coherent: false, reason: `llm_http_${res.status}` };
      }
      const json = (await res.json()) as AnthropicResponse;
      const text = json.content?.[0]?.text?.trim();
      if (!text) return { coherent: false, reason: 'llm_empty' };
      return parseModelOutput(text);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { coherent: false, reason: 'llm_timeout' };
      }
      return { coherent: false, reason: 'llm_error' };
    } finally {
      clearTimeout(timer);
    }
  };
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

const SYSTEM_PROMPT = [
  "You verify whether an AI agent's tool call is coherent with its declared purpose.",
  'Respond with strict JSON: {"coherent": true|false, "reason": "<≤80 chars when false>"}.',
  'Deny if the request targets a different recipient, resource, or scope than the purpose implies.',
  'Be lenient about phrasing; strict about identity (who/what is being acted on).',
  'Never include any prose outside the JSON object.',
].join('\n');

function buildUserMessage(input: CoherenceInput): string {
  return [
    `PURPOSE: ${input.purpose}`,
    `CONSTRAINT: ${JSON.stringify(input.constraint)}`,
    `ACTIONS: ${JSON.stringify(input.actions)}`,
    `REQUEST_ARGS: ${input.requestArgs ? JSON.stringify(input.requestArgs) : '{}'}`,
  ].join('\n');
}

function parseModelOutput(text: string): CoherenceResult {
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return { coherent: false, reason: 'llm_malformed' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return { coherent: false, reason: 'llm_malformed' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { coherent: false, reason: 'llm_malformed' };
  }
  const obj = parsed as { coherent?: unknown; reason?: unknown };
  if (typeof obj.coherent !== 'boolean') {
    return { coherent: false, reason: 'llm_malformed' };
  }
  if (obj.coherent) return { coherent: true };
  const reason = typeof obj.reason === 'string' ? obj.reason.slice(0, 80) : 'llm_denied';
  return { coherent: false, reason };
}
