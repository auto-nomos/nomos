/**
 * LLM risk summary for step-up approvals.
 *
 * Called when a step-up is created. The LLM receives the agent name,
 * the command, the resource, and recent activity, and returns a short
 * human-readable summary + a coarse risk score (low/medium/high).
 *
 * The dashboard and Telegram approval prompts display the summary so
 * the operator can decide without context-switching to logs.
 *
 * Fail-open: any timeout / error returns `null` and the step-up still
 * fires without a summary. The risk summary is decorative, not a gate.
 */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_ID = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 256;

export type RiskScore = 'low' | 'medium' | 'high';

export interface RiskSummaryInput {
  agentName: string;
  command: string;
  resource: Record<string, unknown>;
  /** Optional: recent prior allow decisions for this agent (last ~5). */
  recentActivity?: Array<{ command: string; resource: Record<string, unknown> }>;
}

export interface RiskSummaryResult {
  summary: string;
  riskScore: RiskScore;
  cedarPreview: string;
}

export interface RiskSummaryDeps {
  apiKey: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

export type RiskSummarizer = (input: RiskSummaryInput) => Promise<RiskSummaryResult | null>;

const SYSTEM_PROMPT = [
  "You assess the risk of an AI agent's pending tool call.",
  'Respond with strict JSON: {"summary": "<plain-English ≤200 chars>", "riskScore": "low"|"medium"|"high"}.',
  'Consider: write/delete vs read; whether the resource pattern is broad vs specific; whether the action diverges from recent activity.',
  'No prose outside the JSON object.',
].join('\n');

function buildUserMessage(input: RiskSummaryInput): string {
  return [
    `AGENT: ${input.agentName}`,
    `COMMAND: ${input.command}`,
    `RESOURCE: ${JSON.stringify(input.resource)}`,
    `RECENT_ACTIVITY: ${input.recentActivity ? JSON.stringify(input.recentActivity) : '[]'}`,
  ].join('\n');
}

function escapeCedarString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function renderResourceWhen(resource: Record<string, unknown>): string {
  const keys = Object.keys(resource).sort();
  if (keys.length === 0) return '';
  const parts = keys.map((k) => {
    const v = resource[k];
    if (typeof v === 'string') return `resource.${k} == "${escapeCedarString(v)}"`;
    if (typeof v === 'number' || typeof v === 'boolean') return `resource.${k} == ${String(v)}`;
    return `resource.${k} == "${escapeCedarString(JSON.stringify(v))}"`;
  });
  return ` when { ${parts.join(' && ')} }`;
}

export function buildCedarPreview(input: RiskSummaryInput): string {
  return `permit (\n  principal,\n  action == Action::"${escapeCedarString(input.command)}",\n  resource\n)${renderResourceWhen(input.resource)};`;
}

export function createRiskSummarizer(deps: RiskSummaryDeps): RiskSummarizer {
  const f = deps.fetch ?? globalThis.fetch;
  return async function summarize(input) {
    const cedarPreview = buildCedarPreview(input);
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
      if (!res.ok) return null;
      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = json.content?.[0]?.text?.trim();
      if (!text) return null;
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
      if (!parsed || typeof parsed !== 'object') return null;
      const obj = parsed as { summary?: unknown; riskScore?: unknown };
      const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 200) : null;
      const riskScore =
        obj.riskScore === 'low' || obj.riskScore === 'medium' || obj.riskScore === 'high'
          ? (obj.riskScore as RiskScore)
          : null;
      if (!summary || !riskScore) return null;
      return { summary, riskScore, cedarPreview };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Deterministic fallback: no LLM key configured. */
export function fallbackRiskSummary(input: RiskSummaryInput): RiskSummaryResult {
  const cedarPreview = buildCedarPreview(input);
  const isWrite = /create|update|delete|merge|comment|close|send|post|put|patch/i.test(
    input.command,
  );
  const riskScore: RiskScore = isWrite ? 'medium' : 'low';
  const summary = isWrite
    ? `Write action ${input.command} on ${JSON.stringify(input.resource).slice(0, 80)}`
    : `Read action ${input.command} on ${JSON.stringify(input.resource).slice(0, 80)}`;
  return { summary, riskScore, cedarPreview };
}
