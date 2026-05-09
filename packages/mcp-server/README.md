# @credential-broker/mcp-server

Distributable MCP server backed by Credential Broker. Wire it into Claude
Desktop, Cursor, or any MCP-speaking client. The agent never holds the OAuth
token — every call is gated by your Cedar policies and proxied through the
PDP, which holds the customer's OAuth grants.

## How it works

```
Claude Desktop / Cursor
        ↓ stdio
@credential-broker/mcp-server
        ↓ POST /v1/mint-ucan        (Bearer cb_… api key)
Credential Broker control plane
        ↓ short-lived UCAN
@credential-broker/mcp-server
        ↓ POST /v1/proxy/<command>  (UCAN, no api key)
Credential Broker PDP
        ↓ injects your OAuth token
GitHub / Slack / Google / Notion
```

The PDP sees only the UCAN — never your API key. The agent process sees only
the upstream response — never your OAuth token.

## Install + wire

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "credential-broker": {
      "command": "npx",
      "args": [
        "-y",
        "@credential-broker/mcp-server",
        "--config",
        "/Users/me/.cb-mcp.json"
      ]
    }
  }
}
```

```jsonc
// /Users/me/.cb-mcp.json
{
  "apiKey": "cb_<customer-uuid>_<secret>",
  "pdpUrl": "https://pdp.example.com",
  "controlPlaneUrl": "https://api.example.com",
  "integrations": ["github", "slack"]
}
```

Restart Claude (or the equivalent client). The available tools depend on the
`integrations` array — the matrix below shows what each enables.

| Integration | Tools |
|---|---|
| `github` | `github_read_user`, `github_read_repo`, `github_create_issue`, `github_merge_pr` |
| `slack` | `slack_list_channels`, `slack_post_message` |
| `google` | `google_drive_list` |
| `notion` | `notion_page_read`, `notion_database_query` |

## Env-var fallback

If you can't ship a config file (Docker, ephemeral CI, etc.), drive the server
through env vars:

```bash
export CB_API_KEY=cb_...
export CB_PDP_URL=https://pdp.example.com
export CB_CONTROL_PLANE_URL=https://api.example.com
export CB_INTEGRATIONS=github,slack
credential-broker-mcp
```

`--config <file>` always wins when both are present.

## Authoring policies

Before the agent's tool calls succeed, your tenant needs at least one Cedar
policy that permits the relevant `/integration/...` action. Author them in the
dashboard's policy editor, then attach them to the agent.

The action vocabulary is the same one this package emits — see
`packages/schema-packs/src/<integration>/index.ts` for the canonical list.
