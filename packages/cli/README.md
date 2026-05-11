# @auto-nomos/cli

`cb` — the credential-broker command-line.

```sh
# After `pnpm dev:up` boots the local stack:
cb status                     # health-check control-plane / pdp / dashboard
cb setup                      # generate signing keys + secrets, write .env.local
cb tui                        # terminal UI (status / approvals / audit panes)
cb connect-agent claude-code  # write ~/.claude/skills/credential-broker/SKILL.md
cb connect-agent claude-desktop
cb connect-agent cursor
cb connect-agent chatgpt --out ./gpt
cb connect-agent custom --out ./bundle
```

## Environment

| Var                       | Default                  | Used by               |
| ------------------------- | ------------------------ | --------------------- |
| `CB_CONTROL_PLANE_URL`    | `http://localhost:8788`  | status, connect-agent |
| `CB_PDP_URL`              | `http://localhost:8787`  | status, connect-agent |
| `CB_API_KEY`              | (none)                   | connect-agent         |
| `CB_REPO_ROOT`            | (auto-detect)            | setup                 |

## Subcommands in detail

### `cb setup [--force]`

Re-runs `scripts/setup-wizard.mts` from the repo root. Idempotent — only
writes keys that are missing. `--force` rotates existing keys.

### `cb status [--cp <url>] [--pdp <url>] [--dashboard <url>]`

Pings `/healthz` on each service. Exits non-zero if any fail.

### `cb connect-agent <client>`

Writes the agent-client config that points at this broker.

| client          | output                                                      |
| --------------- | ----------------------------------------------------------- |
| `claude-code`   | `~/.claude/skills/credential-broker/SKILL.md`               |
| `claude-desktop`| Patches `claude_desktop_config.json` (creates if missing)   |
| `cursor`        | Patches `~/.cursor/mcp.json`                                |
| `chatgpt`       | OpenAPI 3 manifest the user uploads in the GPT Editor       |
| `custom`        | `.cb-mcp.json` + README in `<out>/`                         |
