# mcp-github (deprecated example)

> **Looking for the production MCP server?** Use [`@credential-broker/mcp-server`](../../packages/mcp-server)
> instead. It's the distributable equivalent of this file: zero-trust by
> default (proxy mode, no agent-side OAuth token), supports multiple
> integrations, and ships as `npx -y @credential-broker/mcp-server`.

This example is kept for tests and historical reference. It uses the older
`/v1/authorize` flow where the agent holds the GitHub token directly.

Reference Model Context Protocol server that exposes GitHub tools (`create_issue`,
`read_repo`, `merge_pr`) gated by the Credential Broker SDK. Each tool call goes
through `/v1/authorize` on a local PDP before reaching the GitHub API. Failed
authorization returns a `denied` payload to the MCP client; the upstream call
never runs.

## Quickstart

1. Bring up the local stack (postgres + control-plane + PDP):

```bash
pnpm db:up
pnpm --filter @credential-broker/control-plane dev   # :8788
pnpm --filter @credential-broker/pdp dev             # :8787
```

2. Issue a UCAN via the control-plane tRPC API and capture its `jwt`. (See
   `scripts/e2e-sprint3.mts` for a working example of customer + agent + policy
   bootstrap.)

3. Run the MCP server with stdio transport:

```bash
CB_API_KEY=cb_<customerId>_<secret> \
CB_PDP_URL=http://localhost:8787 \
CB_UCAN=<jwt> \
GITHUB_TOKEN=ghp_... \
pnpm --filter @credential-broker/example-mcp-github dev
```

4. Point Claude Desktop / Cursor at it, or attach an MCP inspector:

```bash
npx @modelcontextprotocol/inspector pnpm --filter @credential-broker/example-mcp-github dev
```

## What it demonstrates

- **The agent never sees the GitHub PAT.** The PAT is held by the MCP server.
  Phase 1 stops there. Sprint 5 will move the PAT/OAuth token entirely behind
  the PDP proxy adapter.
- **Authorization is fail-closed.** PDP unreachable, malformed response, or
  policy denial all return `denied`.
- **Receipts are emitted after every successful upstream call** so the audit log
  reflects what actually happened, not just what was authorized.

## Tools

| Tool | Command | Resource |
|---|---|---|
| `create_issue` | `/github/issue/create` | `{ repo: "<owner>/<repo>" }` |
| `read_repo` | `/github/repo/read` | `{ repo: "<owner>/<repo>" }` |
| `merge_pr` | `/github/pr/merge` | `{ repo, pr }` |

Bind a Cedar policy to your agent that permits the commands and resources you
want enabled. The PDP enforces both `command` and `resource` shape — a policy
that allows `/github/issue/create` does not allow `/github/pr/merge` and vice
versa.
