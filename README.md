# Nomos — Agent Authorization Platform

> **Website:** [auto-nomos.com](https://auto-nomos.com)  •  **Docs:** [docs.auto-nomos.com](https://app.auto-nomos.com/docs)  •  **npm:** `@auto-nomos/*`

**The authorization layer for AI agents.** Nomos sits between your agents and every SaaS API you connect — GitHub, Slack, Linear, Stripe, Google, Notion, your filesystem, your cloud — and makes sure each agent can only do what your policy says, before the call ever leaves your network. The agent never holds an OAuth token; every action runs against a short-lived signed delegation (UCAN), gated by Cedar policy, and lands in a tamper-evident audit chain.

## Start here

- **Use the hosted product:** [app.auto-nomos.com/sign-up](https://app.auto-nomos.com/sign-up) — 2 minutes to first call.
- **Read the docs:** [docs.auto-nomos.com](https://app.auto-nomos.com/docs) — five journey-based tutorials.
- **Hack on this repo:** the [Quickstart](#quickstart-development) below boots the full stack locally.

## What you get

1. **Credentials never leak.** OAuth tokens are encrypted in the broker. The agent gets a UCAN good for one method on one resource for the next few minutes.
2. **Policy enforced before the call.** Cedar runs on every request. Denials return 403 at the PDP — not "we logged it, sorry."
3. **Every decision is provable.** Allows, denies, and step-ups land in an Ed25519-signed Merkle chain. Verify offline with `@auto-nomos/audit-verify`.

12 providers shipping today across SaaS (GitHub, Slack, Google Workspace, Notion, Linear, Stripe, Discord), filesystem, SSH, and federated cloud IAM (Azure, AWS, GCP).

Multi-agent orchestration (LangGraph / CrewAI / AutoGen / Claude sub-agents) is supported via attenuated UCAN chains — see [docs/SWARM_SECURITY.md](docs/SWARM_SECURITY.md) or the live [Swarm delegation guide](https://app.auto-nomos.com/docs/policies/swarm-delegation).

## Monorepo layout

```
credential-broker/
├── apps/
│   ├── control-plane/     # Hono + tRPC API server (Sprint 3)
│   ├── pdp/               # Hono PDP runtime (Sprint 2)
│   ├── dashboard/         # Next.js admin console (Sprint 6)
│   ├── docs/              # Mintlify docs (Sprint 11)
│   └── landing/           # Marketing site (Sprint 11)
├── packages/
│   ├── shared-types/      # Zod schemas + TS types
│   ├── crypto/            # @noble + DID utilities
│   ├── ucan/              # @ucanto with conventions
│   ├── cedar/             # cedar-wasm with conventions
│   ├── core/              # end-to-end decide() function
│   ├── sdk-typescript/    # public SDK for MCP server developers (Sprint 4)
│   ├── policy-builder/    # React Flow policy editor (Sprint 7)
│   ├── schema-packs/      # per-integration validators (Sprint 10)
│   └── ui/                # shadcn-based shared components (Sprint 6)
├── infrastructure/
│   ├── fly/               # Fly.io app definitions
│   ├── vercel/            # Vercel project configs
│   └── neon/              # DB migrations (Sprint 3)
├── e2e/                   # Playwright + Vitest e2e
└── docs/
    └── adr/               # Architecture decision records
```

## Quickstart (development)

```bash
# Prereqs: Node 22 LTS, pnpm 11, Docker
nvm use                       # picks up .nvmrc
corepack enable && corepack prepare pnpm@11.0.8 --activate

# Install + boot Postgres
pnpm install
pnpm db:up

# Watch the wedge run end-to-end (mints a UCAN, proxies through PDP to a mock GitHub)
pnpm demo

# Other useful commands
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm demo` is the fastest way to confirm everything is wired correctly. It boots
the control-plane and PDP in-process, signs up a customer, creates a Cedar policy,
mints a proxy-bound UCAN, and exercises both an allowed and a denied call —
proving the OAuth token never leaves the PDP. To wire it to your real Claude
Desktop or Cursor, see `packages/mcp-server/README.md`.

## Examples

Copy-paste starters in [`examples/`](./examples) — each is a runnable reference, not pseudocode:

| Example | What it shows |
|---|---|
| [`mcp-filesystem`](./examples/mcp-filesystem) | Dynamic-scope (Approval Envelope) flow on the local filesystem — one `read_path` tool proving the full loop |
| [`mcp-github-dynamic`](./examples/mcp-github-dynamic) | Dynamic-mode GitHub MCP server — every tool call asks the broker for a per-request UCAN |
| [`mcp-github`](./examples/mcp-github) | Minimal GitHub MCP reference (superseded by [`@auto-nomos/mcp-server`](./packages/mcp-server) for production) |
| [`swarm-orchestrator`](./examples/swarm-orchestrator) | Multi-agent swarm with attenuated UCAN delegation chains |
| [`claude-subagents-nomos`](./examples/claude-subagents-nomos) | Claude Code sub-agents authorized through Nomos |
| [`langgraph-nomos`](./examples/langgraph-nomos) | A 3-agent LangGraph chain authorized through Nomos |
| [`crewai-nomos`](./examples/crewai-nomos) | CrewAI tasks, each running as a Nomos-authorized agent |

## Sprint roadmap

This repo was built sprint-by-sprint. Per-sprint detail lives in commit history (tags `sprint-N-end`).

| Sprint | Weeks | Outcome |
|---|---|---|
| 1 | 1–2 | Monorepo + 5 core packages (shared-types, crypto, ucan, cedar, core) |
| 2 | 3–4 | PDP MVP deployed to Fly.io |
| 3 | 5–6 | Control plane + Drizzle data model + signed policy bundles |
| 4 | 7–8 | TS SDK + first MCP integration |
| 5 | 9–10 | OAuth ↔ UCAN bridge (the wedge) |
| 6 | 11–12 | Dashboard MVP |
| 7 | 13–14 | Visual policy builder |
| 8 | 15–16 | Revocation Hub + audit integrity |
| 9 | 17–18 | Step-up approval service |
| 10 | 19–20 | Schema packs (top 10 integrations) |
| 11 | 21–22 | Polish, docs, billing |
| 12 | 23–24 | Beta launch + compliance prep |

## Tech stack (locked in)

- TypeScript on Node.js 22 LTS
- Hono (PDP + control plane)
- Drizzle ORM + Postgres on Neon
- `@ucanto/core` (UCAN v1.0)
- `@cedar-policy/cedar-wasm`
- `@noble/curves`, `@noble/hashes`
- Better-Auth + WorkOS (SSO/SCIM)
- Next.js 15 App Router + shadcn/ui + Tailwind
- Fly.io (backend) + Vercel (frontend)
- pnpm + Turborepo + Biome + Vitest

## Contributing

1. Branch: `sprint-N/<short-task-name>`. Never push directly to `main`.
2. Tests first. Implementation second.
3. One commit per task. Format: `[sprint-N][package-or-app] short imperative`.
4. Pre-commit hook runs Biome + lint-staged. Never bypass with `--no-verify`.
5. Tag at sprint end: `git tag sprint-N-end`.

See `docs/adr/` for architectural decisions. New decisions that contradict the locked-in stack must be captured as ADRs first.

## License

UNLICENSED. Internal use only until further notice.
