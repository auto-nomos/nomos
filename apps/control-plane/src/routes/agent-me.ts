/**
 * GET /v1/agent/me/tools — API-key-authenticated tool discovery.
 *
 * Returns the integrations + commands the calling agent's customer has
 * policies for. Used by `@auto-nomos/mcp-server` at startup so the MCP
 * client doesn't need a static `CB_INTEGRATIONS` env var — the platform
 * is the single source of truth.
 *
 * Security note: this is a *discovery hint* for MCP tool advertisement,
 * not an authorization decision. PDP still evaluates Cedar at proxy time;
 * declaring an integration here does not bypass policy.
 */
import type { IntegrationId } from '@auto-nomos/schema-packs';
import { actionsFor, KNOWN_INTEGRATIONS } from '@auto-nomos/schema-packs';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { type ApiKeyAuthVariables, apiKeyAuth } from '../middleware/api-key-auth.js';
import { getLog } from '../middleware/logger.js';

export interface AgentMeRouteDeps {
  db: Db;
}

export function createAgentMeRoutes(
  deps: AgentMeRouteDeps,
): Hono<{ Variables: ApiKeyAuthVariables }> {
  const app = new Hono<{ Variables: ApiKeyAuthVariables }>();

  app.get('/v1/agent/me/tools', apiKeyAuth({ db: deps.db }), async (c) => {
    const log = getLog(c);
    const customerId = c.get('customerId');
    const agentId = c.get('agentId');

    const rows = await deps.db.drizzle
      .select({
        integrationId: schema.policies.integrationId,
        cedarText: schema.policies.cedarText,
      })
      .from(schema.agentPolicies)
      .innerJoin(schema.policies, eq(schema.agentPolicies.policyId, schema.policies.id))
      .where(
        and(
          eq(schema.agentPolicies.agentId, agentId),
          eq(schema.agentPolicies.customerId, customerId),
        ),
      );

    const found = new Set<IntegrationId>();
    for (const r of rows) {
      if (r.integrationId && KNOWN_INTEGRATIONS.has(r.integrationId)) {
        found.add(r.integrationId as IntegrationId);
        continue;
      }
      // Multi-provider policies leave integrationId null. Extract the
      // top-level command segments from `Action::"/<seg>/..."` literals.
      for (const m of r.cedarText.matchAll(/Action::"\/([a-z_]+)\//g)) {
        const seg = m[1];
        if (seg && KNOWN_INTEGRATIONS.has(seg)) {
          found.add(seg as IntegrationId);
        }
      }
    }
    const integrations = Array.from(found).sort() as IntegrationId[];

    const commands = integrations.flatMap((id) => actionsFor(id)).sort();

    const agent = await deps.db.drizzle.query.agents.findFirst({
      where: eq(schema.agents.id, agentId),
      columns: { id: true, name: true },
    });

    log.info(
      { customerId, agentId, integrations: integrations.length, commands: commands.length },
      'agent/me/tools',
    );

    return c.json({
      agentId,
      agentName: agent?.name ?? null,
      integrations,
      commands,
    });
  });

  return app;
}
