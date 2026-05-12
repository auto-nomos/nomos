/**
 * LLM risk summary + Cedar drafter for step-up approvals.
 *
 * Called when a step-up is created. The LLM receives the agent name,
 * the command, and the resource. It returns a short human-readable
 * summary, a coarse risk score (low/medium/high), THREE Cedar policy
 * variants (narrow / medium / broad scope), and a recommended scope.
 *
 * The operator picks one variant in the dashboard and that exact Cedar
 * persists as the grant snippet — so the human is approving the actual
 * policy text, not a paraphrase of it.
 *
 * Validation: every variant is parsed via `@auto-nomos/cedar.parsePolicy`
 * before being returned. Variants that fail to parse are silently replaced
 * with the deterministic `buildCedarPreview` fallback so the picker
 * always has three usable options.
 *
 * Fail-open: any timeout / error returns `null` and `fallbackRiskSummary`
 * provides deterministic variants. The risk summary is decorative, not a
 * gate.
 */
import { parsePolicy } from '@auto-nomos/cedar';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_ID = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 1024;

export type RiskScore = 'low' | 'medium' | 'high';
export type VariantScope = 'narrow' | 'medium' | 'broad';

export interface CedarVariants {
  narrow: string;
  medium: string;
  broad: string;
}

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
  /** Single deterministic preview retained for backwards compat (pre-P2 callers). */
  cedarPreview: string;
  cedarVariants: CedarVariants;
  recommendedScope: VariantScope;
}

export interface RiskSummaryDeps {
  apiKey: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

export type RiskSummarizer = (input: RiskSummaryInput) => Promise<RiskSummaryResult | null>;

const SYSTEM_PROMPT = [
  "You assess the risk of an AI agent's pending tool call AND draft Cedar",
  'policies for the human operator to approve.',
  '',
  'Respond with strict JSON ONLY (no prose, no markdown fence):',
  '{',
  '  "summary": "<plain-English ≤200 chars>",',
  '  "riskScore": "low" | "medium" | "high",',
  '  "cedarVariants": {',
  '    "narrow":  "<Cedar permit clause for THIS exact resource>",',
  '    "medium":  "<Cedar permit clause for the same scope (e.g. same repo, channel, dataset)>",',
  '    "broad":   "<Cedar permit clause for any resource of this action>"',
  '  },',
  '  "recommendedScope": "narrow" | "medium" | "broad"',
  '}',
  '',
  'Cedar rules:',
  '- Use `permit ( principal, action == Action::"<command>", resource ) when { ... };`',
  '- Match the resource attributes the agent sent (`resource.repo`, `resource.owner`, etc.).',
  '- Each variant MUST be a syntactically valid Cedar policy (single clause, terminated with `;`).',
  '- For "narrow", match every resource attribute the agent supplied.',
  '- For "medium", match a meaningful subset (e.g. just `resource.owner` and `resource.repo` for GitHub, just `resource.channel` for Slack).',
  '- For "broad", omit the `when` clause entirely — every resource matches.',
  '- Default `recommendedScope` to "narrow" for high-risk writes, "medium" for routine writes, "broad" for reads.',
  '- No prose outside the JSON object.',
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

function renderPermit(command: string, whenClause: string): string {
  return `permit (\n  principal,\n  action == Action::"${escapeCedarString(command)}",\n  resource\n)${whenClause};`;
}

export function buildCedarPreview(input: RiskSummaryInput): string {
  return renderPermit(input.command, renderResourceWhen(input.resource));
}

/** Deterministic three-variant builder used when the LLM is unreachable
 *  or returns un-parseable Cedar. */
export function buildCedarVariants(input: RiskSummaryInput): CedarVariants {
  const narrow = renderPermit(input.command, renderResourceWhen(input.resource));
  const mediumSubset = pickMediumSubset(input.resource);
  const medium = renderPermit(input.command, renderResourceWhen(mediumSubset));
  const broad = renderPermit(input.command, '');
  return { narrow, medium, broad };
}

function pickMediumSubset(resource: Record<string, unknown>): Record<string, unknown> {
  // Heuristic: keep the highest-cardinality "container" fields and drop the
  // specific instance. owner+repo for GitHub, channel for Slack, etc. If
  // none match, fall back to the full resource (medium == narrow).
  const out: Record<string, unknown> = {};
  for (const k of [
    'owner',
    'repo',
    'repo_name',
    'channel',
    'database',
    'database_id',
    'workspace',
  ]) {
    if (resource[k] !== undefined) out[k] = resource[k];
  }
  if (Object.keys(out).length === 0) return resource;
  return out;
}

function isParseableCedar(text: string): boolean {
  try {
    const r = parsePolicy(text);
    return r.ok;
  } catch {
    return false;
  }
}

function sanitizeVariants(
  rawVariants: Partial<CedarVariants> | undefined,
  fallbacks: CedarVariants,
): CedarVariants {
  const narrow =
    rawVariants?.narrow && isParseableCedar(rawVariants.narrow)
      ? rawVariants.narrow
      : fallbacks.narrow;
  const medium =
    rawVariants?.medium && isParseableCedar(rawVariants.medium)
      ? rawVariants.medium
      : fallbacks.medium;
  const broad =
    rawVariants?.broad && isParseableCedar(rawVariants.broad) ? rawVariants.broad : fallbacks.broad;
  return { narrow, medium, broad };
}

export function createRiskSummarizer(deps: RiskSummaryDeps): RiskSummarizer {
  const f = deps.fetch ?? globalThis.fetch;
  return async function summarize(input) {
    const fallbacks = buildCedarVariants(input);
    const cedarPreview = fallbacks.narrow;
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
      const obj = parsed as {
        summary?: unknown;
        riskScore?: unknown;
        cedarVariants?: unknown;
        recommendedScope?: unknown;
      };
      const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 200) : null;
      const riskScore =
        obj.riskScore === 'low' || obj.riskScore === 'medium' || obj.riskScore === 'high'
          ? (obj.riskScore as RiskScore)
          : null;
      if (!summary || !riskScore) return null;

      const rawVariants =
        obj.cedarVariants && typeof obj.cedarVariants === 'object'
          ? (obj.cedarVariants as Partial<CedarVariants>)
          : undefined;
      const cedarVariants = sanitizeVariants(rawVariants, fallbacks);
      const recommendedScope: VariantScope =
        obj.recommendedScope === 'narrow' ||
        obj.recommendedScope === 'medium' ||
        obj.recommendedScope === 'broad'
          ? (obj.recommendedScope as VariantScope)
          : 'narrow';

      return {
        summary,
        riskScore,
        cedarPreview,
        cedarVariants,
        recommendedScope,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Deterministic fallback: no LLM key configured or call failed. */
export function fallbackRiskSummary(input: RiskSummaryInput): RiskSummaryResult {
  const cedarVariants = buildCedarVariants(input);
  const isWrite = /create|update|delete|merge|comment|close|send|post|put|patch/i.test(
    input.command,
  );
  const isDelete = /delete/i.test(input.command);
  const riskScore: RiskScore = isDelete ? 'high' : isWrite ? 'medium' : 'low';
  const summary = isWrite
    ? `Write action ${input.command} on ${JSON.stringify(input.resource).slice(0, 80)}`
    : `Read action ${input.command} on ${JSON.stringify(input.resource).slice(0, 80)}`;
  const recommendedScope: VariantScope = isDelete ? 'narrow' : isWrite ? 'medium' : 'broad';
  return {
    summary,
    riskScore,
    cedarPreview: cedarVariants.narrow,
    cedarVariants,
    recommendedScope,
  };
}
