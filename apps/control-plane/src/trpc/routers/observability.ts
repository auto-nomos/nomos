/**
 * Agent observability — read-only aggregates over audit_events.
 *
 * Powers the dashboard's per-swarm Observability tab and the workspace-wide
 * /monitoring page. Every procedure is tenant-scoped via `tenantProcedure`.
 *
 * Heuristic anomaly detection (no ML): rolling 7-day baselines for deny
 * rate, chain depth, resource set, plus first-occurrence command flag.
 * "CAN do vs DOES do" diff parses each mapped policy's Cedar via
 * `@auto-nomos/policy-builder` on the fly.
 */
import { parseToIr } from '@auto-nomos/policy-builder';
import type {
  ActionGraph,
  ActionGraphEdge,
  ActionGraphNode,
  SpanStatus,
} from '@auto-nomos/shared-types';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../db/schema.js';
import { router, withPermission } from '../index.js';

const WindowDays = z.number().int().min(1).max(30).default(7);

/**
 * Drizzle's raw `sql` template inlines arrays as a single JSON-ish param,
 * which breaks Postgres `ANY()`. Emit a proper `IN (...)` literal list.
 * Caller must guard against empty arrays — `IN ()` is a syntax error.
 */
function inLiteral(values: string[]) {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

export type AnomalyKind = 'new_command' | 'deny_spike' | 'depth_spike' | 'resource_widened';

export interface Anomaly {
  agentId: string;
  agentName: string;
  agentDid: string;
  kind: AnomalyKind;
  evidence: Record<string, unknown>;
}

export const observabilityRouter = router({
  /**
   * Recent receipts — last `limit` audit_events for the customer (optionally
   * filtered to a single swarm). Caller polls with `refetchInterval` for a
   * live feed.
   */
  liveFeed: withPermission('audit', 'read')
    .input(
      z.object({
        swarmId: z.string().uuid().optional(),
        limit: z.number().int().positive().max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(schema.auditEvents.customerId, ctx.customerId)];
      if (input.swarmId) conds.push(eq(schema.auditEvents.swarmId, input.swarmId));
      const rows = await ctx.db.drizzle
        .select({
          eventId: schema.auditEvents.eventId,
          ts: schema.auditEvents.ts,
          agent: schema.auditEvents.agent,
          decision: schema.auditEvents.decision,
          command: schema.auditEvents.command,
          chainDepth: schema.auditEvents.chainDepth,
          parentReceiptId: schema.auditEvents.parentReceiptId,
          swarmId: schema.auditEvents.swarmId,
        })
        .from(schema.auditEvents)
        .where(and(...conds))
        .orderBy(desc(schema.auditEvents.ts))
        .limit(input.limit);
      return rows;
    }),

  /**
   * Per-agent aggregates over a rolling N-day window. Single GROUP BY agent
   * over audit_events; joins to the agents table for name + DID.
   */
  agentInventory: withPermission('audit', 'read')
    .input(
      z.object({
        swarmId: z.string().uuid().optional(),
        windowDays: WindowDays,
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = sql`now() - (${input.windowDays} || ' days')::interval`;
      const swarmFilter = input.swarmId ? sql`AND a.swarm_id = ${input.swarmId}` : sql``;
      const result = await ctx.db.drizzle.execute<{
        agent_id: string;
        agent_name: string;
        agent_did: string;
        depth: number;
        swarm_id: string | null;
        total: number;
        allow: number;
        deny: number;
        stepup: number;
        distinct_commands: number;
        distinct_resources: number;
        max_chain_depth: number | null;
        last_ts: string | null;
      }>(sql`
        SELECT
          a.id AS agent_id,
          a.name AS agent_name,
          a.did AS agent_did,
          a.depth AS depth,
          a.swarm_id AS swarm_id,
          COALESCE(SUM(CASE WHEN ev.decision IS NOT NULL THEN 1 ELSE 0 END), 0)::int AS total,
          COALESCE(SUM(CASE WHEN ev.decision = 'allow' THEN 1 ELSE 0 END), 0)::int AS allow,
          COALESCE(SUM(CASE WHEN ev.decision = 'deny' THEN 1 ELSE 0 END), 0)::int AS deny,
          COALESCE(SUM(CASE WHEN ev.decision = 'stepup' THEN 1 ELSE 0 END), 0)::int AS stepup,
          COUNT(DISTINCT ev.command)::int AS distinct_commands,
          COUNT(DISTINCT ev.resource::text)::int AS distinct_resources,
          MAX(ev.chain_depth) AS max_chain_depth,
          MAX(ev.ts)::text AS last_ts
        FROM agents a
        LEFT JOIN audit_events ev
          ON ev.agent = a.did
         AND ev.customer_id = a.customer_id
         AND ev.ts >= ${since}
        WHERE a.customer_id = ${ctx.customerId}
          AND a.status = 'active'
          ${swarmFilter}
        GROUP BY a.id, a.name, a.did, a.depth, a.swarm_id
        ORDER BY total DESC, a.created_at DESC
      `);
      return result.rows.map((r) => ({
        agentId: r.agent_id,
        agentName: r.agent_name,
        agentDid: r.agent_did,
        depth: r.depth,
        swarmId: r.swarm_id,
        total: r.total,
        allow: r.allow,
        deny: r.deny,
        stepup: r.stepup,
        denyRate: r.total > 0 ? r.deny / r.total : 0,
        distinctCommands: r.distinct_commands,
        distinctResources: r.distinct_resources,
        maxChainDepth: r.max_chain_depth,
        lastTs: r.last_ts ? new Date(r.last_ts) : null,
      }));
    }),

  /**
   * "What this agent CAN do (policies) vs what it DOES do (audit)" diff.
   * Cedar-parses each mapped policy on the fly via `parseToIr` and
   * enumerates the action ids; any policy with `action.kind === 'all'`
   * widens the capability set to wildcard.
   */
  capabilityDiff: withPermission('audit', 'read')
    .input(
      z.object({
        agentId: z.string().uuid(),
        windowDays: WindowDays,
      }),
    )
    .query(async ({ ctx, input }) => {
      const agent = await ctx.db.drizzle.query.agents.findFirst({
        where: and(
          eq(schema.agents.id, input.agentId),
          eq(schema.agents.customerId, ctx.customerId),
        ),
        columns: { id: true, did: true, name: true },
      });
      if (!agent) throw new TRPCError({ code: 'NOT_FOUND', message: 'agent not found' });

      const mapped = await ctx.db.drizzle
        .select({
          policyId: schema.policies.id,
          policyName: schema.policies.name,
          cedarText: schema.policies.cedarText,
          integrationId: schema.policies.integrationId,
        })
        .from(schema.agentPolicies)
        .innerJoin(schema.policies, eq(schema.agentPolicies.policyId, schema.policies.id))
        .where(
          and(
            eq(schema.agentPolicies.agentId, input.agentId),
            eq(schema.agentPolicies.customerId, ctx.customerId),
          ),
        );

      let wildcardCapability = false;
      const canCommands = new Set<string>();
      const unrepresentablePolicies: { policyId: string; reason: string }[] = [];
      for (const p of mapped) {
        const ir = parseToIr(p.cedarText);
        for (const u of ir.unrepresentable) {
          unrepresentablePolicies.push({ policyId: p.policyId, reason: u.reason });
        }
        for (const policy of ir.policies) {
          if (policy.effect !== 'permit') continue;
          const a = policy.action;
          if (a.kind === 'all') {
            wildcardCapability = true;
          } else if (a.kind === 'eq') {
            canCommands.add(a.id);
          } else if (a.kind === 'in') {
            for (const id of a.ids) canCommands.add(id);
          }
        }
      }

      const since = sql`now() - (${input.windowDays} || ' days')::interval`;
      const didRows = await ctx.db.drizzle.execute<{ command: string; ct: number }>(sql`
        SELECT command, COUNT(*)::int AS ct
        FROM audit_events
        WHERE customer_id = ${ctx.customerId}
          AND agent = ${agent.did}
          AND ts >= ${since}
        GROUP BY command
        ORDER BY ct DESC
      `);
      const didCommandsMap = new Map(didRows.rows.map((r) => [r.command, r.ct]));
      const didCommands = [...didCommandsMap.keys()];

      const unusedCapabilities = wildcardCapability
        ? []
        : [...canCommands].filter((c) => !didCommandsMap.has(c)).sort();
      const outOfPolicy = wildcardCapability
        ? []
        : didCommands.filter((c) => !canCommands.has(c)).sort();

      return {
        agentId: agent.id,
        agentName: agent.name,
        agentDid: agent.did,
        canCommands: [...canCommands].sort(),
        didCommands: didCommands.sort(),
        didCommandCounts: Object.fromEntries(didCommandsMap),
        unusedCapabilities,
        outOfPolicy,
        wildcardCapability,
        policyCount: mapped.length,
        unrepresentablePolicies,
      };
    }),

  /**
   * Heuristic anomaly badges over a rolling N-day window.
   *
   * - `new_command`: agent ran a command for the first time in last 24h.
   * - `deny_spike`: today's deny rate > 7d mean + 2σ (min 5 today).
   * - `depth_spike`: today's max chain depth > 7d max.
   * - `resource_widened`: today's distinct resources > 2× 7d daily avg (min 3 today).
   */
  anomalies: withPermission('audit', 'read')
    .input(
      z.object({
        swarmId: z.string().uuid().optional(),
        windowDays: WindowDays,
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = sql`now() - (${input.windowDays} || ' days')::interval`;
      const today = sql`now() - interval '24 hours'`;
      const swarmFilter = input.swarmId ? sql`AND a.swarm_id = ${input.swarmId}` : sql``;

      // Pull agent universe scoped to the customer (and swarm if given).
      const agents = await ctx.db.drizzle.execute<{
        id: string;
        name: string;
        did: string;
      }>(sql`
        SELECT a.id, a.name, a.did
        FROM agents a
        WHERE a.customer_id = ${ctx.customerId}
          AND a.status = 'active'
          ${swarmFilter}
      `);
      if (agents.rows.length === 0) return [] as Anomaly[];
      const dids = agents.rows.map((r) => r.did);
      const didsList = inLiteral(dids);
      const byDid = new Map(agents.rows.map((r) => [r.did, r]));

      // New command — flagged when first occurrence is inside the last 24h.
      const newCmdRows = await ctx.db.drizzle.execute<{
        agent: string;
        command: string;
        first_seen: string;
      }>(sql`
        SELECT agent, command, MIN(ts)::text AS first_seen
        FROM audit_events
        WHERE customer_id = ${ctx.customerId}
          AND agent IN (${didsList})
          AND ts >= ${since}
        GROUP BY agent, command
        HAVING MIN(ts) >= ${today}
      `);

      // Deny spike — today rate vs (mean + 2σ) of prior days.
      const denyRows = await ctx.db.drizzle.execute<{
        agent: string;
        today_total: number;
        today_deny: number;
        baseline_mean: number | null;
        baseline_stddev: number | null;
      }>(sql`
        WITH per_day AS (
          SELECT
            agent,
            date_trunc('day', ts) AS day,
            COUNT(*)::int AS total,
            SUM(CASE WHEN decision = 'deny' THEN 1 ELSE 0 END)::int AS deny
          FROM audit_events
          WHERE customer_id = ${ctx.customerId}
            AND agent IN (${didsList})
            AND ts >= ${since}
          GROUP BY agent, date_trunc('day', ts)
        )
        SELECT
          agent,
          COALESCE(SUM(total) FILTER (WHERE day >= date_trunc('day', now())), 0)::int AS today_total,
          COALESCE(SUM(deny) FILTER (WHERE day >= date_trunc('day', now())), 0)::int AS today_deny,
          AVG(deny::float / NULLIF(total, 0)) FILTER (WHERE day < date_trunc('day', now())) AS baseline_mean,
          STDDEV_SAMP(deny::float / NULLIF(total, 0)) FILTER (WHERE day < date_trunc('day', now())) AS baseline_stddev
        FROM per_day
        GROUP BY agent
      `);

      // Depth spike — today max vs prior-day max.
      const depthRows = await ctx.db.drizzle.execute<{
        agent: string;
        today_max: number | null;
        baseline_max: number | null;
      }>(sql`
        SELECT
          agent,
          MAX(chain_depth) FILTER (WHERE ts >= date_trunc('day', now())) AS today_max,
          MAX(chain_depth) FILTER (WHERE ts <  date_trunc('day', now())) AS baseline_max
        FROM audit_events
        WHERE customer_id = ${ctx.customerId}
          AND agent IN (${didsList})
          AND ts >= ${since}
          AND chain_depth IS NOT NULL
        GROUP BY agent
      `);

      // Resource widening — today distinct count vs prior-day avg.
      const resourceRows = await ctx.db.drizzle.execute<{
        agent: string;
        today_distinct: number;
        baseline_avg: number | null;
      }>(sql`
        WITH per_day AS (
          SELECT
            agent,
            date_trunc('day', ts) AS day,
            COUNT(DISTINCT resource::text)::int AS distinct_resources
          FROM audit_events
          WHERE customer_id = ${ctx.customerId}
            AND agent IN (${didsList})
            AND ts >= ${since}
          GROUP BY agent, date_trunc('day', ts)
        )
        SELECT
          agent,
          COALESCE(MAX(distinct_resources) FILTER (WHERE day >= date_trunc('day', now())), 0)::int AS today_distinct,
          AVG(distinct_resources) FILTER (WHERE day < date_trunc('day', now())) AS baseline_avg
        FROM per_day
        GROUP BY agent
      `);

      const anomalies: Anomaly[] = [];
      for (const r of newCmdRows.rows) {
        const a = byDid.get(r.agent);
        if (!a) continue;
        anomalies.push({
          agentId: a.id,
          agentName: a.name,
          agentDid: a.did,
          kind: 'new_command',
          evidence: { command: r.command, firstSeen: r.first_seen },
        });
      }
      for (const r of denyRows.rows) {
        const a = byDid.get(r.agent);
        if (!a) continue;
        if (r.today_total < 5) continue;
        const todayRate = r.today_deny / r.today_total;
        const mean = r.baseline_mean ?? 0;
        const stddev = r.baseline_stddev ?? 0;
        const threshold = mean + 2 * stddev;
        if (stddev === 0 && mean === 0) continue;
        if (todayRate > threshold) {
          anomalies.push({
            agentId: a.id,
            agentName: a.name,
            agentDid: a.did,
            kind: 'deny_spike',
            evidence: {
              todayDenyRate: todayRate,
              baselineMean: mean,
              baselineStddev: stddev,
              todayDeny: r.today_deny,
              todayTotal: r.today_total,
            },
          });
        }
      }
      for (const r of depthRows.rows) {
        const a = byDid.get(r.agent);
        if (!a) continue;
        const todayMax = r.today_max ?? 0;
        const baseMax = r.baseline_max ?? 0;
        if (todayMax > baseMax && todayMax > 0) {
          anomalies.push({
            agentId: a.id,
            agentName: a.name,
            agentDid: a.did,
            kind: 'depth_spike',
            evidence: { todayMaxDepth: todayMax, baselineMaxDepth: baseMax },
          });
        }
      }
      for (const r of resourceRows.rows) {
        const a = byDid.get(r.agent);
        if (!a) continue;
        const today = r.today_distinct;
        const baselineAvg = r.baseline_avg ?? 0;
        if (today < 3) continue;
        if (baselineAvg > 0 && today > 2 * baselineAvg) {
          anomalies.push({
            agentId: a.id,
            agentName: a.name,
            agentDid: a.did,
            kind: 'resource_widened',
            evidence: { todayDistinctResources: today, baselineAvg },
          });
        }
      }
      return anomalies;
    }),

  /**
   * Blast radius for a swarm — if any leaf is compromised, what's reachable.
   * Combines: agent_policies → policies (allowed commands) + oauth_connections
   * (customer-wide upstream tokens) + audit-derived actual reach.
   */
  blastRadius: withPermission('audit', 'read')
    .input(z.object({ swarmId: z.string().uuid(), windowDays: WindowDays }))
    .query(async ({ ctx, input }) => {
      const swarm = await ctx.db.drizzle.query.swarms.findFirst({
        where: and(
          eq(schema.swarms.id, input.swarmId),
          eq(schema.swarms.customerId, ctx.customerId),
        ),
        columns: { id: true, name: true },
      });
      if (!swarm) throw new TRPCError({ code: 'NOT_FOUND', message: 'swarm not found' });

      const agents = await ctx.db.drizzle.query.agents.findMany({
        where: and(
          eq(schema.agents.customerId, ctx.customerId),
          eq(schema.agents.swarmId, input.swarmId),
        ),
        columns: { id: true, name: true, did: true, depth: true },
      });
      if (agents.length === 0) {
        return {
          swarmId: input.swarmId,
          swarmName: swarm.name,
          commandsReachable: [] as string[],
          resourcesReachable: 0,
          integrationsReachable: [] as string[],
          byAgent: [] as {
            agentId: string;
            agentName: string;
            depth: number;
            canCommands: string[];
            didCommands: string[];
            wildcard: boolean;
          }[],
        };
      }

      const connections = await ctx.db.drizzle
        .select({ connector: schema.oauthConnections.connector })
        .from(schema.oauthConnections)
        .where(eq(schema.oauthConnections.customerId, ctx.customerId));
      const integrationsReachable = [...new Set(connections.map((c) => c.connector))].sort();

      const agentIds = agents.map((a) => a.id);
      const mapped =
        agentIds.length === 0
          ? []
          : await ctx.db.drizzle
              .select({
                agentId: schema.agentPolicies.agentId,
                cedarText: schema.policies.cedarText,
              })
              .from(schema.agentPolicies)
              .innerJoin(schema.policies, eq(schema.agentPolicies.policyId, schema.policies.id))
              .where(
                and(
                  eq(schema.agentPolicies.customerId, ctx.customerId),
                  inArray(schema.agentPolicies.agentId, agentIds),
                ),
              );

      const allCommands = new Set<string>();
      const perAgentCan = new Map<string, { commands: Set<string>; wildcard: boolean }>();
      for (const a of agents) perAgentCan.set(a.id, { commands: new Set(), wildcard: false });
      for (const m of mapped) {
        const bucket = perAgentCan.get(m.agentId);
        if (!bucket) continue;
        const ir = parseToIr(m.cedarText);
        for (const p of ir.policies) {
          if (p.effect !== 'permit') continue;
          if (p.action.kind === 'all') {
            bucket.wildcard = true;
          } else if (p.action.kind === 'eq') {
            bucket.commands.add(p.action.id);
            allCommands.add(p.action.id);
          } else if (p.action.kind === 'in') {
            for (const id of p.action.ids) {
              bucket.commands.add(id);
              allCommands.add(id);
            }
          }
        }
      }

      const dids = agents.map((a) => a.did);
      const didsList = inLiteral(dids);
      const since = sql`now() - (${input.windowDays} || ' days')::interval`;
      const didRows = await ctx.db.drizzle.execute<{
        agent: string;
        command: string;
      }>(sql`
        SELECT DISTINCT agent, command
        FROM audit_events
        WHERE customer_id = ${ctx.customerId}
          AND agent IN (${didsList})
          AND ts >= ${since}
      `);
      const perDidDid = new Map<string, Set<string>>();
      for (const r of didRows.rows) {
        const set = perDidDid.get(r.agent) ?? new Set<string>();
        set.add(r.command);
        perDidDid.set(r.agent, set);
      }

      const resourcesRow = await ctx.db.drizzle.execute<{ ct: number }>(sql`
        SELECT COUNT(DISTINCT resource::text)::int AS ct
        FROM audit_events
        WHERE customer_id = ${ctx.customerId}
          AND agent IN (${didsList})
          AND ts >= ${since}
      `);

      return {
        swarmId: swarm.id,
        swarmName: swarm.name,
        commandsReachable: [...allCommands].sort(),
        resourcesReachable: resourcesRow.rows[0]?.ct ?? 0,
        integrationsReachable,
        byAgent: agents.map((a) => {
          const can = perAgentCan.get(a.id) ?? { commands: new Set<string>(), wildcard: false };
          return {
            agentId: a.id,
            agentName: a.name,
            depth: a.depth,
            canCommands: [...can.commands].sort(),
            didCommands: [...(perDidDid.get(a.did) ?? new Set<string>())].sort(),
            wildcard: can.wildcard,
          };
        }),
      };
    }),

  /**
   * Workspace-wide summary for the /monitoring header tiles.
   */
  globalSummary: withPermission('audit', 'read')
    .input(z.object({ windowDays: WindowDays }))
    .query(async ({ ctx, input }) => {
      const since = sql`now() - (${input.windowDays} || ' days')::interval`;
      const result = await ctx.db.drizzle.execute<{
        total: number;
        allow: number;
        deny: number;
        stepup: number;
        distinct_agents: number;
        distinct_swarms: number;
      }>(sql`
        SELECT
          COUNT(*)::int AS total,
          SUM(CASE WHEN decision = 'allow' THEN 1 ELSE 0 END)::int AS allow,
          SUM(CASE WHEN decision = 'deny' THEN 1 ELSE 0 END)::int AS deny,
          SUM(CASE WHEN decision = 'stepup' THEN 1 ELSE 0 END)::int AS stepup,
          COUNT(DISTINCT agent)::int AS distinct_agents,
          COUNT(DISTINCT swarm_id)::int AS distinct_swarms
        FROM audit_events
        WHERE customer_id = ${ctx.customerId}
          AND ts >= ${since}
      `);
      const row = result.rows[0] ?? {
        total: 0,
        allow: 0,
        deny: 0,
        stepup: 0,
        distinct_agents: 0,
        distinct_swarms: 0,
      };
      return {
        windowDays: input.windowDays,
        total: row.total,
        allow: row.allow,
        deny: row.deny,
        stepup: row.stepup,
        distinctAgents: row.distinct_agents,
        distinctSwarms: row.distinct_swarms,
      };
    }),

  /**
   * Action graph — answer "what did each agent actually do, and what did
   * that trigger next?" Returns one node per participating agent + one node
   * per span. Edges connect agents to their spans (kind=invokes) and chain
   * span → next-agent's first span when delegation occurred (kind=handoff).
   *
   * Window defaults to 60 minutes; capped at 24h so the React Flow canvas
   * stays usable.
   */
  actionGraph: withPermission('audit', 'read')
    .input(
      z.object({
        swarmId: z.string().uuid().optional(),
        agentId: z.string().uuid().optional(),
        sinceMinutes: z.number().int().min(1).max(1440).default(60),
      }),
    )
    .query(async ({ ctx, input }): Promise<ActionGraph> => {
      const since = sql`now() - (${input.sinceMinutes} || ' minutes')::interval`;
      const swarmFilter = input.swarmId ? sql`AND s.swarm_id = ${input.swarmId}` : sql``;
      const agentFilter = input.agentId ? sql`AND s.agent_id = ${input.agentId}` : sql``;

      const spanRows = await ctx.db.drizzle.execute<{
        id: string;
        agent_id: string;
        parent_span_id: string | null;
        receipt_id: string;
        tool_name: string;
        status: string;
        http_status: number | null;
        latency_ms: number;
        started_at: Date | string;
        parent_receipt_id: string | null;
      }>(sql`
        SELECT
          s.id,
          s.agent_id,
          s.parent_span_id,
          s.receipt_id,
          s.tool_name,
          s.status,
          s.http_status,
          s.latency_ms,
          s.started_at,
          ae.parent_receipt_id
        FROM agent_spans s
        LEFT JOIN audit_events ae ON ae.event_id::text = s.receipt_id
        WHERE s.customer_id = ${ctx.customerId}
          AND s.created_at >= ${since}
          ${swarmFilter}
          ${agentFilter}
        ORDER BY s.started_at ASC
        LIMIT 500
      `);

      const spans = spanRows.rows;
      const agentIds = Array.from(new Set(spans.map((s) => s.agent_id)));

      const agentRows =
        agentIds.length === 0
          ? []
          : await ctx.db.drizzle
              .select({
                id: schema.agents.id,
                name: schema.agents.name,
                did: schema.agents.did,
                depth: schema.agents.depth,
              })
              .from(schema.agents)
              .where(
                and(
                  eq(schema.agents.customerId, ctx.customerId),
                  inArray(schema.agents.id, agentIds),
                ),
              );

      const spansPerAgent = new Map<string, number>();
      for (const s of spans) {
        spansPerAgent.set(s.agent_id, (spansPerAgent.get(s.agent_id) ?? 0) + 1);
      }

      const nodes: ActionGraphNode[] = [];
      for (const a of agentRows) {
        nodes.push({
          kind: 'agent',
          id: a.id,
          label: a.name,
          did: a.did,
          depth: a.depth ?? null,
          spanCount: spansPerAgent.get(a.id) ?? 0,
        });
      }
      for (const s of spans) {
        nodes.push({
          kind: 'span',
          id: s.id,
          agentId: s.agent_id,
          toolName: s.tool_name,
          status: s.status as SpanStatus,
          latencyMs: s.latency_ms,
          httpStatus: s.http_status,
          startedAt:
            s.started_at instanceof Date ? s.started_at.toISOString() : String(s.started_at),
        });
      }

      // Build receipt→span lookup for handoff edges. A span's
      // audit_events.parent_receipt_id points at the receipt that triggered
      // *this* authorize; we resolve that to a previous span if it exists in
      // the window.
      const spanByReceipt = new Map<string, string>();
      for (const s of spans) {
        spanByReceipt.set(s.receipt_id, s.id);
      }

      const edges: ActionGraphEdge[] = [];
      for (const s of spans) {
        edges.push({
          id: `${s.agent_id}->${s.id}`,
          from: s.agent_id,
          to: s.id,
          kind: 'invokes',
        });
        // Handoff: parent receipt's span → this span (cross-agent only;
        // same-agent re-invokes are not handoffs, just sequential calls).
        if (s.parent_receipt_id) {
          const parentSpan = spanByReceipt.get(s.parent_receipt_id);
          if (parentSpan) {
            edges.push({
              id: `${parentSpan}=>${s.id}`,
              from: parentSpan,
              to: s.id,
              kind: 'handoff',
            });
          }
        }
        // Explicit parent_span_id from MCP emitter (preferred when present
        // and the parent is in-window).
        if (s.parent_span_id) {
          edges.push({
            id: `${s.parent_span_id}~>${s.id}`,
            from: s.parent_span_id,
            to: s.id,
            kind: 'handoff',
          });
        }
      }

      return {
        nodes,
        edges,
        windowMinutes: input.sinceMinutes,
        spanCount: spans.length,
      };
    }),

  /**
   * Flat list of recent spans, newest first. Cheap fallback when the graph
   * is too dense to read.
   */
  actionTimeline: withPermission('audit', 'read')
    .input(
      z.object({
        swarmId: z.string().uuid().optional(),
        agentId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(schema.agentSpans.customerId, ctx.customerId)];
      if (input.swarmId) conds.push(eq(schema.agentSpans.swarmId, input.swarmId));
      if (input.agentId) conds.push(eq(schema.agentSpans.agentId, input.agentId));

      const rows = await ctx.db.drizzle
        .select({
          id: schema.agentSpans.id,
          agentId: schema.agentSpans.agentId,
          swarmId: schema.agentSpans.swarmId,
          receiptId: schema.agentSpans.receiptId,
          toolName: schema.agentSpans.toolName,
          status: schema.agentSpans.status,
          httpStatus: schema.agentSpans.httpStatus,
          latencyMs: schema.agentSpans.latencyMs,
          startedAt: schema.agentSpans.startedAt,
          endedAt: schema.agentSpans.endedAt,
          errorCode: schema.agentSpans.errorCode,
        })
        .from(schema.agentSpans)
        .where(and(...conds))
        .orderBy(desc(schema.agentSpans.startedAt))
        .limit(input.limit);

      return rows.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt.toISOString(),
      }));
    }),

  /**
   * Full detail for one span — opened in the drawer when a node is clicked.
   */
  spanDetail: withPermission('audit', 'read')
    .input(z.object({ spanId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.drizzle.query.agentSpans.findFirst({
        where: and(
          eq(schema.agentSpans.id, input.spanId),
          eq(schema.agentSpans.customerId, ctx.customerId),
        ),
      });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });

      const agent = await ctx.db.drizzle.query.agents.findFirst({
        where: eq(schema.agents.id, row.agentId),
        columns: { id: true, name: true, did: true, depth: true },
      });

      return {
        ...row,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        agent: agent ?? null,
      };
    }),
});
