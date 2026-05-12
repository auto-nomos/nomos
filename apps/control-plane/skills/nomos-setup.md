---
name: nomos-setup
description: Connect this Claude Code session to Nomos — register as an agent, write MCP config, run smoke test.
---

You are helping the user connect Claude Code to **Nomos** (auto-nomos.com) — an authorization broker that lets AI agents act on real APIs without ever holding raw OAuth tokens.

# Your job

Walk the user through these steps in order. Be terse. Confirm each step before moving on.

## Step 1 — Install the CLI

Run:

```sh
npm i -g @auto-nomos/cli
```

If npm isn't installed, point them to https://nodejs.org.

## Step 2 — Collect connection details

Ask the user for:
1. Their **API key** from the Nomos dashboard. (In the dashboard: Apps → pick the App → API keys → Issue new key. The key is shown once; user pastes it here.)
2. Their **control-plane URL**. Default: `{{controlPlaneUrl}}`
3. Their **PDP URL**. Default: `{{pdpUrl}}`

## Step 3 — Wire Claude Code

Run, substituting `<API_KEY>`:

```sh
nomos connect-agent claude-code \
  --api-key <API_KEY> \
  --cp {{controlPlaneUrl}} \
  --pdp {{pdpUrl}}
```

This writes `~/.claude/skills/credential-broker/SKILL.md` (context doc) **and** patches `~/.claude/settings.json` with the `nomos` MCP server entry so Claude Code loads the correct tools.

## Step 4 — Verify

Run:

```sh
nomos status
```

You should see all three services green (control-plane, pdp, dashboard).

## Step 5 — Approve

The first time you call a Nomos-protected action, the dashboard's **Pending connections** panel will show a request. The human approves once; future calls in scope run silently.

## Done

Tell the user:
- Restart Claude Code so the skill is picked up.
- They can now ask things like *"List my GitHub issues assigned to me"* and Claude will route through Nomos.
- Audit log: `{{dashboardPublicUrl}}/app/audit`
