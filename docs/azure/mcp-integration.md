# MCP integration

Nomos ships a Model Context Protocol server that lets IDE-side agents
(Cursor, Claude Code, Claude Desktop, Continue) call Azure ARM through
the broker without writing any glue code.

## What the server exposes

Package: [`@auto-nomos/mcp-server`](https://www.npmjs.com/package/@auto-nomos/mcp-server) (currently `0.0.19`).

The server registers two classes of Azure tools:

1. **Semantic tools** — one per common ARM action, with a typed
   parameter schema. The runtime fills the ARM URL template.
2. **Escape hatch** — `azure_raw_call` for anything that doesn't have a
   semantic tool.

### Semantic tool catalog

Tool names are `azure_<action>` (kebab→snake). Every `actionToCommand`
entry has a tool; templates exist for ~80 of them (the rest fall back to
`azure_raw_call` with a hint). Examples:

| Tool | Underlying command | ARM path template |
|---|---|---|
| `azure_list_subscriptions` | `/azure/subscriptions/list` | `GET /subscriptions` |
| `azure_list_resource_groups` | `/azure/resource_groups/list` | `GET /subscriptions/{subscription_id}/resourceGroups` |
| `azure_create_resource_group` | `/azure/resource_groups/create` | `PUT /subscriptions/{subscription_id}/resourceGroups/{resource_group}` |
| `azure_delete_resource_group` | `/azure/resource_groups/delete` | `DELETE /subscriptions/{subscription_id}/resourceGroups/{resource_group}` |
| `azure_list_vms` | `/azure/vm/list` | `GET /subscriptions/{subscription_id}/providers/Microsoft.Compute/virtualMachines` |
| `azure_get_vm` | `/azure/vm/get` | `GET …/virtualMachines/{name}` |
| `azure_run_command_vm` | `/azure/vm/run_command` | `POST …/virtualMachines/{name}/runCommand` |
| `azure_get_kv_secret` | `/azure/key_vaults/get_secret` | `GET https://{vault}.vault.azure.net/secrets/{secret}` |
| `azure_log_analytics_kql` | `/azure/log_analytics/kql` | `POST https://api.loganalytics.io/v1/workspaces/{workspace_id}/query` |
| `azure_cosmos_query` | `/azure/cosmos/query` | `POST <account>.documents.azure.com/dbs/{db}/colls/{coll}/docs` |
| `azure_raw_call` | `/azure/raw_call` | any |

Browse the live list with:

```bash
npx @auto-nomos/mcp-server@latest tools --filter azure | head -40
```

### The escape hatch — `azure_raw_call`

Use this when no semantic tool fits, or when you need to exercise a
private-preview API. The agent passes:

```jsonc
{
  "method": "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  "host":   "management.azure.com" | "<account>.vault.azure.net" | …,
  "path":   "/subscriptions/…",
  "query":  { "api-version": "2024-…" },
  "body":   { … }            // for PUT/PATCH/POST
}
```

The PDP enforces Cedar against the *resolved command* — `raw_call` is
its own action id in the catalog. Customer Cedar must explicitly
permit `Action::"/azure/raw_call"` and may additionally filter on
`resource.path_prefix`.

```cedar
permit (
  principal == Agent::"advanced-ops",
  action == Action::"/azure/raw_call",
  resource
) when {
  resource.path_prefix == "/providers/Microsoft.ResourceHealth/"
};
```

## Installing in Cursor

Edit `~/.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "nomos": {
      "command": "npx",
      "args": ["-y", "@auto-nomos/mcp-server@0.0.19", "serve"],
      "env": {
        "NOMOS_API_KEY":            "<api-key from /app/agents/<id>>",
        "NOMOS_CUSTOMER_ID":        "<your org uuid>",
        "NOMOS_CLOUD_CONNECTION_ID": "<your cloud connection uuid>",
        "NOMOS_CONTROL_PLANE_URL":  "https://api.auto-nomos.com",
        "NOMOS_PDP_URL":            "https://pdp.auto-nomos.com",
        "NOMOS_INTEGRATIONS":       "azure"
      }
    }
  }
}
```

Restart Cursor. The tools appear under the `nomos` server in the chat
side panel.

## Installing in Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "nomos": {
      "command": "npx",
      "args": ["-y", "@auto-nomos/mcp-server@0.0.19", "serve"],
      "env": { /* same as Cursor */ }
    }
  }
}
```

Restart Claude Desktop.

## Installing in Claude Code

In a project repo:

```bash
claude mcp add nomos \
  --command 'npx -y @auto-nomos/mcp-server@0.0.19 serve' \
  --env NOMOS_API_KEY=… \
  --env NOMOS_CUSTOMER_ID=… \
  --env NOMOS_CLOUD_CONNECTION_ID=… \
  --env NOMOS_INTEGRATIONS=azure
```

## Configuration reference

| Env var | Required | Default | Notes |
|---|---|---|---|
| `NOMOS_API_KEY` | yes | — | One-time-reveal from agent detail page |
| `NOMOS_CUSTOMER_ID` | yes | — | Your org uuid (visible at `/app/settings/workspace`) |
| `NOMOS_CLOUD_CONNECTION_ID` | required for cloud | — | Per-Azure-subscription connection id |
| `NOMOS_INTEGRATIONS` | yes | — | Comma list. Add `azure` to expose Azure tools. Other values: `github,slack,google_drive,…` |
| `NOMOS_CONTROL_PLANE_URL` | no | `https://api.auto-nomos.com` | Self-hosted broker |
| `NOMOS_PDP_URL` | no | `https://pdp.auto-nomos.com` | Self-hosted PDP |
| `NOMOS_DEFAULT_SUBSCRIPTION_ID` | no | — | Sets the default `subscription_id` so agents don't need to repeat it |

## How an agent uses a tool

Mental model:

1. Agent calls `azure_list_vms({ subscription_id: SUB })`.
2. MCP server maps `list_vms` → command `/azure/vm/list` + ARM template.
3. Server hits `POST /v1/mint-ucan` with `commands=['/azure/vm/list']`.
4. Server fills ARM URL: `GET /subscriptions/{SUB}/providers/Microsoft.Compute/virtualMachines?api-version=2024-03-01`.
5. Server hits `POST /v1/proxy/azure/vm/list` with the UCAN + apiCall.
6. PDP runs Cedar + risk gate + federation → ARM 200.
7. MCP server returns ARM body to the agent.

The agent never sees the UCAN, the AAD token, or the Azure App
Registration. It sees a typed function and a JSON result.

## Cosigner flow from MCP

When the agent calls a destructive tool:

```
azure_delete_resource_group({ subscription_id, resource_group: 'tmp-rg' })
```

The PDP returns `cosigner_required`. The MCP server propagates this as
a tool error with the `stepUpUrl`. Cursor / Claude Desktop render the
URL as a clickable link. The operator clicks, approves via passkey, and
the agent retries the same tool call — the SDK reads the cosigner JWT
from the dashboard, attaches it to `context.cosignerJwt`, and the call
goes through.

```
Agent: azure_delete_resource_group({ … })
       ↓ tool error
       "cosigner_required — approve at https://app.auto-nomos.com/approve/8856…"
       ↓ (operator clicks, approves passkey)
Agent: azure_delete_resource_group({ … })  // retry
       ↓ tool result
       { deleted: true }
```

## Audit trail of MCP-initiated calls

Every MCP call ends up in the audit chain with `agent_id` set to the
agent the API key belongs to. To find all MCP-initiated calls for a
given agent:

```sql
SELECT id, payload->>'command' as cmd, payload->>'arm_status' as status
FROM audit_chain
WHERE customer_id = '<your org>'
  AND payload->>'agent_id' = '<agent uuid>'
  AND payload->'context'->>'origin' = 'mcp'
ORDER BY id DESC
LIMIT 50;
```

Or in the dashboard: `/app/audit?agent=<id>&origin=mcp`.

## Limitations

| | |
|---|---|
| One IDE = one cloud connection | If you need to talk to two subscriptions, set up two MCP servers under different names in `mcp.json`. |
| Tool argument schemas are best-effort | The ARM body shape isn't strictly typed in the MCP tool — pass the right JSON or get a 400. |
| Long-running ARM ops | The agent must poll the `Location` header itself via repeated `azure_raw_call`. |
| Streaming responses | Not supported — ARM responses come back as a single JSON blob. |
| Microsoft Graph / Entra ID admin | Out of scope. Use the OAuth bridge for Graph. |

## Updating the server

Tools get added every release. After a minor or patch bump:

```bash
# Cursor / Claude Desktop: edit args version pin.
# Or pin to latest:
"args": ["-y", "@auto-nomos/mcp-server@latest", "serve"]
```

Tool schemas are advertised over MCP — the IDE picks up new tools on
next restart without further config.
