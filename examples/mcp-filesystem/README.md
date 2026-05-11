# mcp-filesystem (reference example)

End-to-end demo of the credential-broker dynamic-scope (Approval Envelope) flow on the local filesystem. One MCP tool — `read_path` — proves the loop:

1. Agent calls `read_path("/Users/x/finance/2026/q1.pdf")`.
2. The MCP server requests an Intent for `path_prefix="/Users/x/finance/2026/"`, ttl 5 min.
3. First call into a new directory family triggers a passkey step-up (control plane returns a deep link).
4. Operator approves on the dashboard → cosigner JWT.
5. SDK retries `/v1/intent` with the cosigner; control plane mints an envelope (24h) + a child UCAN (5 min) bound to the prefix.
6. PDP enforces the constraint twice — pre-Cedar gate (`packages/core/src/decide.ts`) and the data-plane filesystem proxy (`apps/pdp/src/adapters/filesystem.ts`).
7. Subsequent reads inside `/Users/x/finance/2026/` are silent. A read of `/Users/x/finance/2025/...` re-prompts.

## Run locally

```sh
export CB_API_KEY=cb_<customer>_<secret>
export CB_PDP_URL=http://localhost:8787
export CB_CONTROL_PLANE_URL=http://localhost:8788
pnpm -F @auto-nomos/example-mcp-filesystem build
node dist/bin.js
```

Wire into Claude Desktop by adding to its MCP server list.

## What this demonstrates vs `mcp-github`

`mcp-github` shows static-policy proxy mode (one long-lived UCAN per command). `mcp-filesystem` shows dynamic per-request narrowing — every call requests a tightly-scoped UCAN that dies in 5 minutes.
