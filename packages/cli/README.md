# `@auto-nomos/cli`

`cb` — the Nomos command-line. Health checks, agent-host wiring, local setup, terminal UI.

## Install

```bash
npm i -g @auto-nomos/cli
# or:
pnpm dlx @auto-nomos/cli <command>
```

Node 22+.

## Quick reference

```bash
cb status                      # health-check control plane, PDP, dashboard
cb setup                       # generate signing keys + secrets, write .env.local
cb tui                         # terminal UI (status / approvals / audit panes)

# Wire an agent host to talk to this broker:
cb connect-agent cursor
cb connect-agent claude-desktop
cb connect-agent claude-code
cb connect-agent codex
cb connect-agent chatgpt --out ./gpt
cb connect-agent custom --out ./bundle

# Local introspection:
cb actions <provider>          # list every command an adapter supports
cb policy validate <file>      # local Cedar lint
cb policy simulate <file> --request <req.json>   # dry-run an authorize
```

## Environment

| Variable | Default | Used by |
|---|---|---|
| `NOMOS_CONTROL_URL` | `http://localhost:8788` | status, connect-agent, policy |
| `NOMOS_PDP_URL` | `http://localhost:8787` | status, connect-agent |
| `NOMOS_API_KEY` | (none) | connect-agent, policy simulate |
| `NOMOS_REPO_ROOT` | (auto-detect) | setup |

Legacy `CB_*` env vars are still read for back-compat — prefer `NOMOS_*` for new code.

CLI flags take precedence over env. Env takes precedence over discovered defaults.

## Subcommands

### `cb status`

```bash
cb status
# control-plane http://localhost:8788  ok
# pdp           http://localhost:8787  ok
# dashboard     http://localhost:3000  ok
```

Pings `/health` on each service. Exits non-zero if any fail. Flags:
`--cp <url>`, `--pdp <url>`, `--dashboard <url>` to override.

### `cb setup [--force]`

Idempotent. Generates missing signing + encryption keys and writes them to
`.env.local`. `--force` rotates existing keys (use with care — old UCANs/tokens
become invalid).

### `cb connect-agent <client>`

Writes the agent host's config so it points at this broker.

| Client | Output |
|---|---|
| `cursor` | Patches Cursor's MCP settings (or prints the block if it can't find the file) |
| `claude-desktop` | Patches `claude_desktop_config.json` (creates if missing) |
| `claude-code` | Runs `claude mcp add nomos …` for you |
| `codex` | Patches `~/.codex/config.toml` |
| `chatgpt` | Writes OpenAPI 3 manifest you upload to GPT Editor |
| `custom` | Writes `.nomos-mcp.json` + README into `<--out>/` |

### `cb actions <provider>`

```bash
cb actions github
# /github/issue/list      GET
# /github/issue/get       GET
# /github/issue/create    POST
# … (full catalog)
```

Pulls from the active `@auto-nomos/adapters` package. Useful when authoring policy.

### `cb policy validate <file>`

Lint a Cedar file locally without round-tripping the server:

```bash
cb policy validate ./policies/safe-default.cedar
# OK — 4 statements, 0 warnings
```

### `cb policy simulate`

Dry-run an authorize request against a local policy file:

```bash
cb policy simulate ./policies/safe-default.cedar --request ./fixtures/list-issues.json
# decision: allow
# matched:  permit#2  (GitHub read pack)
```

### `cb tui`

Three-pane terminal UI: live status, pending approvals, recent audit rows.
Useful as a watch-window during demos.

## Docs

Live docs: [docs.auto-nomos.com/connect/raw-mcp](https://app.auto-nomos.com/docs/connect/raw-mcp)
Source: [github.com/varendra007/nomos](https://github.com/varendra007/nomos)
