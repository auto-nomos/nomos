/**
 * M7 — chain-context fact extraction + retrieval.
 *
 * Per request (after PDP allow), an LLM extracts structural facts
 * (ids, emails, addresses, amounts, urls) from the response body and
 * appends to chain_context_facts keyed by (customer_id, task_id, session_id).
 * Subsequent intent-verification calls pull recent facts and include
 * them in the prompt, blocking cross-step prompt injection like
 * "read inbox -> exfiltrate to attacker@bad.com".
 *
 * Both extraction and verification are flag-gated by
 * INTENT_CHAIN_CONTEXT_ENABLED. When disabled, the entry points are
 * no-ops so the call sites stay clean.
 *
 * Fail-closed-ish: extraction failures log + skip (no facts >= no help,
 * but also no block). Verification failures are policy: caller decides
 * whether `unsure` triggers step-up.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../../db/index.js';
import { chainContextFacts } from '../../db/schema.js';
import type { Logger } from '../../logger.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL_ID = 'claude-haiku-4-5-20251001';
const EXTRACT_MAX_TOKENS = 256;
const VERIFY_MAX_TOKENS = 64;

export const FACT_TYPES = ['id', 'email', 'address', 'amount', 'name', 'url', 'phone'] as const;
export type FactType = (typeof FACT_TYPES)[number];

export interface ChainFact {
  type: FactType;
  value: string;
}

export interface ExtractInput {
  customerId: string;
  taskId: string;
  sessionId: string;
  response: unknown;
  sourceRequestId?: string | undefined;
}

export interface VerifyInput {
  customerId: string;
  taskId: string;
  sessionId: string;
  purpose: string;
  command: string;
  args: Record<string, unknown>;
  /** Override fact-pull limit — default 50. */
  factLimit?: number;
}

export type IntentVerdict = 'aligned' | 'misaligned' | 'unsure';

export interface VerifyResult {
  verdict: IntentVerdict;
  reason?: string;
}

export interface ChainContextDeps {
  db: DrizzleClient;
  apiKey: string;
  enabled: boolean;
  timeoutMs: number;
  logger: Logger;
  fetch?: typeof fetch;
}

export interface ChainContextService {
  extractAndPersist(input: ExtractInput): Promise<ChainFact[]>;
  listFacts(input: {
    customerId: string;
    taskId: string;
    sessionId: string;
    limit?: number;
  }): Promise<ChainFact[]>;
  verify(input: VerifyInput): Promise<VerifyResult>;
}

const NOOP: ChainContextService = {
  extractAndPersist: async () => [],
  listFacts: async () => [],
  verify: async () => ({ verdict: 'aligned', reason: 'chain_context_disabled' }),
};

const EXTRACT_SYSTEM = `You extract structural facts from API response bodies for a security audit log.

Return a JSON array of {type, value} objects. type must be one of: id, email, address, amount, name, url, phone.

Rules:
- value must be a single concrete token (no sentences).
- Skip generic UI strings, timestamps, status codes.
- Truncate values >120 chars.
- Return at most 24 facts.
- Return [] if nothing relevant.

Output format: {"facts": [{"type": "...", "value": "..."}]}. JSON only — no commentary.`;

const VERIFY_SYSTEM = `You audit whether an agent's tool call is consistent with its declared purpose
and the structural facts already established in this task.

Output JSON: {"verdict": "aligned"|"misaligned"|"unsure", "reason": "<one short sentence>"}.

Rules:
- Misaligned = call references entities (recipients, amounts, urls) NOT present in prior facts AND not implied by purpose.
- Aligned = entities are in facts OR explicitly part of purpose.
- Unsure = ambiguous. Caller treats as soft warning.

Output JSON only.`;

interface AnthropicMessageResponse {
  content?: { text?: string }[];
}

function clamp(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function createChainContextService(deps: ChainContextDeps): ChainContextService {
  if (!deps.enabled || !deps.apiKey) return NOOP;

  const fetchFn = deps.fetch ?? globalThis.fetch;

  async function callLlm(system: string, user: string, maxTokens: number): Promise<string> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), deps.timeoutMs);
    try {
      const res = await fetchFn(ANTHROPIC_URL, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': deps.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL_ID,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic HTTP ${res.status}`);
      const json = (await res.json()) as AnthropicMessageResponse;
      return json.content?.[0]?.text ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  function parseFacts(text: string): ChainFact[] {
    try {
      const trimmed = text
        .trim()
        .replace(/^```json/, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(trimmed) as { facts?: { type?: string; value?: string }[] };
      const out: ChainFact[] = [];
      for (const f of parsed.facts ?? []) {
        if (!f.type || !f.value) continue;
        if (!FACT_TYPES.includes(f.type as FactType)) continue;
        const v = clamp(String(f.value), 120);
        if (v.length === 0) continue;
        out.push({ type: f.type as FactType, value: v });
        if (out.length >= 24) break;
      }
      return out;
    } catch {
      return [];
    }
  }

  function parseVerdict(text: string): VerifyResult {
    try {
      const trimmed = text
        .trim()
        .replace(/^```json/, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(trimmed) as { verdict?: string; reason?: string };
      const v = parsed.verdict;
      if (v === 'aligned' || v === 'misaligned' || v === 'unsure') {
        return { verdict: v, reason: parsed.reason };
      }
      return { verdict: 'unsure', reason: 'llm_unknown_verdict' };
    } catch {
      return { verdict: 'unsure', reason: 'llm_parse_failed' };
    }
  }

  return {
    async extractAndPersist(input: ExtractInput): Promise<ChainFact[]> {
      const body = JSON.stringify(input.response).slice(0, 8000);
      let text: string;
      try {
        text = await callLlm(EXTRACT_SYSTEM, body, EXTRACT_MAX_TOKENS);
      } catch (err) {
        deps.logger.warn({ err, taskId: input.taskId }, 'chain-context extract LLM failed');
        return [];
      }
      const facts = parseFacts(text);
      if (facts.length === 0) return [];
      try {
        await deps.db.insert(chainContextFacts).values(
          facts.map((f) => ({
            customerId: input.customerId,
            taskId: input.taskId,
            sessionId: input.sessionId,
            factType: f.type,
            factValue: f.value,
            sourceRequestId: input.sourceRequestId ?? null,
          })),
        );
      } catch (err) {
        deps.logger.warn({ err, taskId: input.taskId }, 'chain-context persist failed');
      }
      return facts;
    },

    async listFacts({ customerId, taskId, sessionId, limit = 50 }): Promise<ChainFact[]> {
      const rows = await deps.db
        .select({ type: chainContextFacts.factType, value: chainContextFacts.factValue })
        .from(chainContextFacts)
        .where(
          and(
            eq(chainContextFacts.customerId, customerId),
            eq(chainContextFacts.taskId, taskId),
            eq(chainContextFacts.sessionId, sessionId),
          ),
        )
        .orderBy(desc(chainContextFacts.createdAt))
        .limit(limit);
      return rows
        .map((r) => ({ type: r.type as FactType, value: r.value }))
        .filter((f) => FACT_TYPES.includes(f.type));
    },

    async verify(input: VerifyInput): Promise<VerifyResult> {
      const facts = await this.listFacts({
        customerId: input.customerId,
        taskId: input.taskId,
        sessionId: input.sessionId,
        limit: input.factLimit,
      });
      const promptParts = [
        `Purpose: ${input.purpose}`,
        `Action: ${input.command}`,
        `Args: ${JSON.stringify(input.args).slice(0, 1000)}`,
        `Prior facts (${facts.length}):`,
        ...facts.slice(0, 24).map((f) => `  - ${f.type}: ${f.value}`),
      ];
      let text: string;
      try {
        text = await callLlm(VERIFY_SYSTEM, promptParts.join('\n'), VERIFY_MAX_TOKENS);
      } catch (err) {
        deps.logger.warn({ err, taskId: input.taskId }, 'chain-context verify LLM failed');
        return { verdict: 'unsure', reason: 'llm_error' };
      }
      return parseVerdict(text);
    },
  };
}

export const __test = { parseFacts: undefined, parseVerdict: undefined };
