# Credential Broker — Agent Authorization Platform

> The capability layer for MCP. Scoped, time-bound, revocable, delegable permissions for AI agents.

## What this is

A SaaS that lets any team shipping AI agents grant fine-grained authorization through a drop-in SDK. Customers connect their existing IdP (Okta/Entra/Google) and SaaS OAuth grants, define policies in a visual builder, and ship MCP servers wrapped with our SDK. Their agents do exactly what policy allows — every other call is rejected at the policy enforcement point (PDP).

**Two architectural principles drive every decision:**
1. **Control plane is the moat; data plane is distribution.** Customers run the PDP runtime; we run the brain. The PDP is portable and can later deploy at customer edge or on-prem without rebuild.
2. **Capability through modules, not new products.** Phase 1 ships core PDP + 3 modules. Phase 2/3 layer on more modules. Architecture never gets ripped up.

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

## Sprint roadmap

This repo is built sprint-by-sprint over 24 weeks. The full plan lives at `~/.claude/plans/wobbly-discovering-pascal.md`. Per-sprint detail in commit history (tags `sprint-N-end`).

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
