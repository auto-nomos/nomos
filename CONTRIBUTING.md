# Contributing to Nomos

Thanks for your interest in Nomos — the authorization layer for AI agents. This guide gets you from a
fresh clone to a green `pnpm verify` and a reviewable pull request.

By contributing you agree that your contributions are licensed under the project's
[Apache License 2.0](./LICENSE).

## Prerequisites

- **Node.js ≥ 22** and **pnpm 11** (`corepack enable` will pick up the pinned `packageManager`).
- **Docker** + Docker Compose (for the local Postgres + Redis dev stack).
- **git**.

## Local setup

```bash
git clone https://github.com/varendra007/nomos.git
cd nomos
pnpm install

# Boot the local stack (Postgres on :5433, Redis, runs the setup wizard + migrations)
pnpm dev:setup
pnpm dev:up            # control-plane :8788, pdp :8787, dashboard :3000
```

See the [Quickstart](./README.md#quickstart-development) in the README for the full walkthrough,
and `infrastructure/docker/docker-compose.dev.yml` for what each service does.

## The check that gates every PR

Run this before you push — CI (`.github/workflows/ci.yml`) runs the same set:

```bash
pnpm verify
# = pnpm typecheck && pnpm lint && pnpm audit:extractors && pnpm audit:parity && pnpm -w test
```

Individual pieces:

| Command | What it checks |
|---|---|
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm lint` / `pnpm lint:fix` | Biome formatting + lint |
| `pnpm test` | Vitest suites (per-package) |
| `pnpm audit:parity` | Every adapter action has a schema-pack command + `apiCallSchema` (no orphans) |
| `pnpm audit:extractors` | Pack extractor coverage |
| `pnpm test:packs` | Each publishable tarball packs with `dist/` and rewritten `workspace:*` ranges |

## Project conventions (please read before a large change)

- **Crypto goes through one package.** Never call `node:crypto`/`crypto.subtle` outside
  `packages/crypto`; never bypass `verifyDetached` / `validateUcan`. Add test vectors for any new algorithm.
- **Multi-tenancy is non-negotiable.** Every Drizzle query in tenant-scoped code filters on
  `customer_id`; every tRPC procedure checks `ctx.customerId`. Cross-tenant tests live at
  `apps/control-plane/src/__tests__/tenancy.integration.test.ts`.
- **Adapters are YAML-first.** New providers ship as `packages/adapters/spec/<id>.yaml` plus a
  schema-pack — see `packages/adapters/README.md`. The parity gate fails closed if they drift.
- **Visual-policy round-trip.** Any IR→Cedar change must pass `roundTrip()` (emit + re-parse) before save.

## Pull requests

1. Branch off `main`. Keep PRs focused; one logical change per PR.
2. Fill in `.github/PULL_REQUEST_TEMPLATE.md` (it prompts the multi-tenancy + crypto review checklists).
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for messages
   (`feat:`, `fix:`, `docs:`, `chore:`, …).
4. Make sure `pnpm verify` is green and CI passes.

## Reporting bugs / requesting features

Open an issue with the matching template. For **security vulnerabilities, do NOT open a public
issue** — follow [SECURITY.md](./SECURITY.md).

## Questions

Join the community on [Discord](https://discord.gg/cKkWQV7B) or start a
[GitHub Discussion](https://github.com/varendra007/nomos/discussions).
