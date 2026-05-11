# mcp-github-dynamic (reference example)

Dynamic-mode MCP server for GitHub. Every tool call asks the broker for
a UCAN scoped exactly to the repo / issue / PR being touched. Compare
with `examples/mcp-github`, which uses the static mint+proxy path
(coarse Cedar policies gate everything).

## Tools

| Tool | Constraint | Step-up trigger |
| --- | --- | --- |
| `read_repo`     | `{owner, repo}`              | First time — silent inside envelope after |
| `read_issue`    | `{owner, repo, issue_number}`| First time per issue — sibling issues re-prompt |
| `create_issue`  | `{owner, repo}`              | **Always** — `create` is high-risk |
| `merge_pr`      | `{owner, repo, pr_number}`   | **Always** — `merge` is high-risk |

## Run locally

```sh
export CB_API_KEY=cb_<customer>_<secret>
export CB_PDP_URL=http://localhost:8787
export CB_CONTROL_PLANE_URL=http://localhost:8788
pnpm -F @auto-nomos/example-mcp-github-dynamic build
node dist/bin.js
```

The agent must be in **dynamic mode** on the dashboard
(`/app/agents/<id>` → "Switch to dynamic"). Static-mode agents will see
`/v1/intent` calls rejected with `agent_static_mode`. The static
example continues to work for static-mode agents in parallel.

## Wire into Claude Desktop

```json
{
  "mcpServers": {
    "cb-github-dyn": {
      "command": "node",
      "args": ["/abs/path/to/examples/mcp-github-dynamic/dist/bin.js"],
      "env": {
        "CB_API_KEY": "cb_xxx",
        "CB_PDP_URL": "http://localhost:8787",
        "CB_CONTROL_PLANE_URL": "http://localhost:8788"
      }
    }
  }
}
```

Then in Claude:

> Use cb-github-dyn `read_repo` on `acme/billing`.

First call: stderr prints a step-up URL. Open it in the browser, click
"Approve with passkey". Claude resumes and prints the repo metadata.
The OAuth token never reached Claude — the broker proxied the call.

Try `read_repo acme/payroll` next: the repo isn't covered by the
existing envelope, so a fresh step-up appears. Deny it on the dashboard
and Claude reports `denied` for that repo. Approve and a second
envelope is minted, scoped to `acme/payroll` only.

## What this proves vs `mcp-github`

`mcp-github` runs against pre-authored Cedar policies — a customer
admin must write a permit rule for every (action, repo) pair upfront.
`mcp-github-dynamic` flips this: a single coarse Cedar permit covers
the action family, and the *resource* scope is minted per request from
a structured intent the SDK supplies. The user names the resource at
prompt time; the broker mints accordingly; the data-plane gate
verifies the upstream URL stays inside the constraint.
