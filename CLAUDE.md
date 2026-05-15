## gstack

Use `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

Available gstack skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

Setup: `git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && PATH="$HOME/.bun/bin:$PATH" ./setup`

## Glossary

- **organization** ≡ the `customers` table row. The DB column name stays
  `customer_id` everywhere for back-compat (PDP, UCAN, audit chain all key
  on it); the new API + dashboard surface says "organization".
- **roles** — `owner` / `admin` / `agent_manager` / `policy_author` /
  `auditor` / `member`. Single source of truth lives in
  `packages/rbac/src/permissions.ts`. See `docs/RBAC.md`.
- **invite flow** — `org_invites` table + 4-branch accept mutation
  (`joined` / `wrong_account` / `needs_signup` / error). See
  `docs/INVITES.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
