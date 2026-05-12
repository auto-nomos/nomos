import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleClient } from '../../db/index.js';
import * as schema from '../../db/schema.js';

export interface GrantRow {
  id: string;
  agentDid: string;
  command: string;
  resourcePattern: Record<string, unknown>;
  scope: 'exact' | 'any';
  decision: 'allow' | 'deny';
  /** When set, emit this Cedar text verbatim inside the bundle instead of
   *  re-deriving from command + resourcePattern. Set by the dashboard's
   *  3-variant picker on grant approval. Null for legacy grants. */
  cedarSnippet?: string | null;
}

export interface StepUpAgent {
  did: string;
}

export async function loadStepUpAgentsForCustomer(
  db: DrizzleClient,
  customerId: string,
): Promise<StepUpAgent[]> {
  const rows = await db
    .select({ did: schema.agents.did })
    .from(schema.agents)
    .where(and(eq(schema.agents.customerId, customerId), eq(schema.agents.stepUpOnDeny, true)));
  return rows;
}

export async function loadActiveGrantsForCustomer(
  db: DrizzleClient,
  customerId: string,
): Promise<GrantRow[]> {
  const rows = await db
    .select({
      id: schema.agentGrants.id,
      agentDid: schema.agents.did,
      command: schema.agentGrants.command,
      resourcePattern: schema.agentGrants.resourcePattern,
      scope: schema.agentGrants.scope,
      decision: schema.agentGrants.decision,
      cedarSnippet: schema.agentGrants.cedarSnippet,
    })
    .from(schema.agentGrants)
    .innerJoin(schema.agents, eq(schema.agentGrants.agentId, schema.agents.id))
    .where(
      and(eq(schema.agentGrants.customerId, customerId), isNull(schema.agentGrants.revokedAt)),
    );
  return rows.map((r) => ({
    id: r.id,
    agentDid: r.agentDid,
    command: r.command,
    resourcePattern: r.resourcePattern as Record<string, unknown>,
    scope: r.scope as 'exact' | 'any',
    decision: r.decision as 'allow' | 'deny',
    cedarSnippet: r.cedarSnippet,
  }));
}

function escapeCedarString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function renderWhenClause(pattern: Record<string, unknown>): string {
  const keys = Object.keys(pattern).sort();
  if (keys.length === 0) return '';
  const parts = keys.map((k) => {
    const v = pattern[k];
    if (typeof v === 'string') return `resource.${k} == "${escapeCedarString(v)}"`;
    if (typeof v === 'number' || typeof v === 'boolean') return `resource.${k} == ${String(v)}`;
    return `resource.${k} == "${escapeCedarString(JSON.stringify(v))}"`;
  });
  return ` when { ${parts.join(' && ')} }`;
}

/**
 * Render a single grant row as a Cedar rule.
 *
 * - When `cedarSnippet` is non-null, emit it verbatim. The dashboard's
 *   3-variant picker writes the operator-selected Cedar text directly
 *   into this column; re-deriving would lose the operator's intent.
 * - Otherwise derive from command + resource_pattern (legacy path):
 *   - decision='allow' → `permit (...) when { ... }`
 *   - decision='deny'  → `forbid (...) when { ... }` (forbid wins over permit)
 *   - scope='any'      → no when clause; the rule matches every resource for the action
 *   - scope='exact'    → when clause keyed on every resource_pattern field
 */
export function renderGrantToCedar(grant: GrantRow): string {
  if (grant.cedarSnippet && grant.cedarSnippet.trim().length > 0) {
    return grant.cedarSnippet.trim().endsWith(';')
      ? grant.cedarSnippet.trim()
      : `${grant.cedarSnippet.trim()};`;
  }
  const verb = grant.decision === 'allow' ? 'permit' : 'forbid';
  const principal = `principal == Agent::"${escapeCedarString(grant.agentDid)}"`;
  const action = `action == Action::"${escapeCedarString(grant.command)}"`;
  const whenClause = grant.scope === 'exact' ? renderWhenClause(grant.resourcePattern) : '';
  return `${verb} (\n  ${principal},\n  ${action},\n  resource\n)${whenClause};`;
}

export function renderGrantsBlock(grants: GrantRow[]): string {
  if (grants.length === 0) return '';
  const rules = grants.map(renderGrantToCedar);
  return ['// === Dynamic agent grants (auto-generated) ===', ...rules].join('\n\n');
}

/**
 * Emit a baseline step-up gate per agent that has step_up_on_deny=true.
 *
 * The PDP runs Cedar twice on a `policy_denied` result: the second pass
 * injects `context.cosigner = true`. With this baseline rule appended,
 * the second pass evaluates to `permit` for any action that wasn't
 * `forbid`-ed by a template, so the PDP triggers a step-up approval.
 *
 * Customers retain the ability to hard-deny specific actions via
 * explicit `forbid` rules in their templates or via deny grants (which
 * render as `forbid` and outrank this `permit`).
 */
export function renderStepUpBaseline(agents: StepUpAgent[]): string {
  if (agents.length === 0) return '';
  const rules = agents.map(
    (a) =>
      `permit (\n  principal == Agent::"${escapeCedarString(a.did)}",\n  action,\n  resource\n) when { context.cosigner == true };`,
  );
  return ['// === Step-up baseline (per-agent step_up_on_deny) ===', ...rules].join('\n\n');
}
