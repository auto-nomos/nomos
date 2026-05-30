# `@auto-nomos/mcp-server`

The MCP server that bridges your editor / agent host to the Nomos broker. Cursor,
Claude Desktop, Claude Code, OpenAI Codex — anything that speaks the **Model
Context Protocol** — can use this to call SaaS APIs without ever holding a token.

```
[ Cursor / Claude / Codex ]
         ↓ MCP (stdio)
@auto-nomos/mcp-server
         ↓ /v1/authorize  (Bearer NOMOS_API_KEY)
Nomos control plane
         ↓ short-lived UCAN
@auto-nomos/mcp-server
         ↓ /v1/proxy/<command>  (Bearer <UCAN>)
Nomos PDP
         ↓ inject decrypted OAuth token
GitHub / Slack / Google / Notion / Linear / Stripe / Discord / Filesystem / SSH / cloud
```

The agent process never sees the OAuth token. The PDP never sees your API key.

## Install

```bash
npx -y @auto-nomos/mcp-server@latest
```

Pin a specific version for production:

```bash
npx -y @auto-nomos/mcp-server@0.0.20
```

Node 22+. Works on macOS, Linux, Windows.

## Wire into Cursor

```jsonc
{
  "name": "Nomos",
  "command": "npx",
  "args": ["-y", "@auto-nomos/mcp-server@latest"],
  "env": {
    "NOMOS_CONTROL_URL": "https://control.auto-nomos.com",
    "NOMOS_API_KEY": "nk_live_…",
    "NOMOS_PDP_URL": "https://pdp.auto-nomos.com"
  }
}
```

Full step-by-step: [docs/connect/cursor](https://app.auto-nomos.com/docs/connect/cursor).

## Wire into Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS),
`%APPDATA%\Claude\claude_desktop_config.json` (Windows),
`~/.config/Claude/claude_desktop_config.json` (Linux):

```jsonc
{
  "mcpServers": {
    "nomos": {
      "command": "npx",
      "args": ["-y", "@auto-nomos/mcp-server@latest"],
      "env": {
        "NOMOS_CONTROL_URL": "https://control.auto-nomos.com",
        "NOMOS_API_KEY": "nk_live_…",
        "NOMOS_PDP_URL": "https://pdp.auto-nomos.com"
      }
    }
  }
}
```

Full step-by-step:
[docs/connect/claude-desktop](https://app.auto-nomos.com/docs/connect/claude-desktop).

## Wire into Claude Code

```bash
claude mcp add nomos \
  -e NOMOS_CONTROL_URL=https://control.auto-nomos.com \
  -e NOMOS_API_KEY=$NOMOS_API_KEY \
  -e NOMOS_PDP_URL=https://pdp.auto-nomos.com \
  -- npx -y @auto-nomos/mcp-server@latest
```

Full step-by-step:
[docs/connect/claude-code](https://app.auto-nomos.com/docs/connect/claude-code).

## Env reference

| Variable | Required | What |
|---|---|---|
| `NOMOS_CONTROL_URL` | yes | `https://control.auto-nomos.com` (hosted) or your self-host URL. |
| `NOMOS_API_KEY` | yes | API key issued from an App detail page. |
| `NOMOS_PDP_URL` | yes | `https://pdp.auto-nomos.com` (hosted) or your self-host URL. |
| `NOMOS_TRANSPORT` | no | `stdio` (default) or `http` for out-of-process hosts. |
| `NOMOS_PORT` | no | HTTP port when `NOMOS_TRANSPORT=http`. Default 7878. |
| `NOMOS_APPROVAL_MODE` | no | `wait` (default — pause for step-up) or `fail_fast`. |
| `NOMOS_LOG_LEVEL` | no | `info` (default), `debug`, `silent`. |

Config-file fallback (legacy, still supported):

```jsonc
// ~/.nomos-mcp.json
{
  "apiKey": "nk_live_…",
  "controlPlaneUrl": "https://control.auto-nomos.com",
  "pdpUrl": "https://pdp.auto-nomos.com"
}
```

Then invoke with `npx -y @auto-nomos/mcp-server --config ~/.nomos-mcp.json`. Env wins
when both are set.

> **Deprecated aliases:** earlier releases (and configs written by older
> `nomos connect-agent` runs) used `CB_API_KEY` / `CB_PDP_URL` /
> `CB_CONTROL_PLANE_URL`. These are still accepted as a fallback, but `NOMOS_*`
> is canonical — prefer it in new configs.

## Validate your setup

Before restarting your MCP client, confirm the config and control-plane wiring
without opening the stdio transport:

```bash
NOMOS_API_KEY=nk_live_… \
NOMOS_CONTROL_URL=https://control.auto-nomos.com \
NOMOS_PDP_URL=https://pdp.auto-nomos.com \
  npx -y @auto-nomos/mcp-server@latest --validate
```

It parses the config, reaches the control plane, lists the integrations your App
is authorised for, and exits `0` on success or `1` with a specific hint on
failure (bad key, unreachable control plane, no policies mapped). Useful as a
preflight or in CI. `--check` is an alias.

## What tools the server advertises

One tool per `(provider, command)` pair allowed by your App's Cedar policy. Examples:

- `github_issue_list`, `github_pr_create`, `github_repo_get_file`
- `slack_message_post`, `slack_channel_history`
- `google_drive_list_files`, `google_gmail_send_message`
- `filesystem_file_read`, `ssh_exec`
- `azure_storage_blob_get`, `aws_s3_get_object`, `gcp_storage_get_object`

Total catalog: ~250 commands across 12 providers.

## Step-up handling

If a tool call hits a step-up gate (policy `when { context.cosigner == true }`),
the server:

1. Returns a structured `requires_approval` error.
2. Notifies you via your configured channel (web push, email, Telegram).
3. You sign with a passkey in the browser.
4. The server retries with the cosigner UCAN.

With `NOMOS_APPROVAL_MODE=fail_fast`, the server skips the wait and surfaces the deny
immediately — useful for batch agents.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Not sure what's wrong | Run `npx -y @auto-nomos/mcp-server@latest --validate` for a pinpointed diagnosis. |
| `tools/list` returns empty | API key wrong, or no Connection on your org. Check `/app/audit` for authorize attempts. |
| `apicall schema_missing` | Stale adapters. Upgrade `@auto-nomos/mcp-server` to ≥ 0.0.18; older versions silently allowed unknown commands. |
| Cursor's tool picker doesn't refresh | Cursor caches MCP servers per session. Quit + relaunch. |
| `NOMOS_API_KEY missing` at boot | Whitespace in env value from copy-paste. Re-set without trailing newline. |

## Docs

Live docs: [docs.auto-nomos.com](https://app.auto-nomos.com/docs)
Source: [github.com/auto-nomos/nomos](https://github.com/auto-nomos/nomos)
