# Nomos — Agent Authorization Platform

<p>
  <a href="https://github.com/auto-nomos/nomos/blob/main/LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="https://www.npmjs.com/org/auto-nomos"><img alt="npm" src="https://img.shields.io/npm/v/%40auto-nomos%2Fsdk?label=%40auto-nomos%2Fsdk"></a>
  <a href="https://pypi.org/project/nomos-sdk/"><img alt="PyPI" src="https://img.shields.io/pypi/v/nomos-sdk?label=nomos-sdk"></a>
  <a href="https://github.com/auto-nomos/nomos/discussions"><img alt="GitHub Discussions" src="https://img.shields.io/github/discussions/auto-nomos/nomos"></a>
</p>

> **Website:** [auto-nomos.com](https://auto-nomos.com)  •  **Docs:** [docs.auto-nomos.com](https://app.auto-nomos.com/docs)  •  **npm:** [`@auto-nomos/*`](https://www.npmjs.com/org/auto-nomos)  •  **PyPI:** [`nomos-sdk`](https://pypi.org/project/nomos-sdk/)

**The authorization layer for AI agents.** Nomos sits between your agents and every SaaS API you connect — GitHub, Slack, Linear, Stripe, Google, Notion, your filesystem, your cloud — and makes sure each agent can only do what your policy says, before the call ever leaves your network. The agent never holds an OAuth token; every action runs against a short-lived signed delegation (UCAN), gated by Cedar policy, and lands in a tamper-evident audit chain.

## Start here

- **Use the hosted product:** [app.auto-nomos.com/sign-up](https://app.auto-nomos.com/sign-up) — 2 minutes to first call.
- **Read the docs:** [docs.auto-nomos.com](https://app.auto-nomos.com/docs) — five journey-based tutorials.
- **Self-host:** [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) — run the PDP + control plane on your own infra.
- **Hack on this repo:** the [Quickstart](#quickstart) below boots the full stack locally.

## What you get

1. **Credentials never leak.** OAuth tokens are encrypted in the broker. The agent gets a UCAN good for one method on one resource for the next few minutes.
2. **Policy enforced before the call.** Cedar runs on every request. Denials return 403 at the PDP — not "we logged it, sorry."
3. **Every decision is provable.** Allows, denies, and step-ups land in an Ed25519-signed Merkle chain. Verify offline with [`@auto-nomos/audit-verify`](https://www.npmjs.com/package/@auto-nomos/audit-verify).

12 providers shipping today across SaaS (GitHub, Slack, Google Workspace, Notion, Linear, Stripe, Discord), filesystem, SSH, and federated cloud IAM (Azure, AWS, GCP).

Multi-agent orchestration (LangGraph / CrewAI / AutoGen / Claude sub-agents) is supported via attenuated UCAN chains — see [docs/SWARM_SECURITY.md](docs/SWARM_SECURITY.md) or the live [Swarm delegation guide](https://app.auto-nomos.com/docs/policies/swarm-delegation).

## Quickstart

**Prereqs:** Node 22 LTS, [pnpm](https://pnpm.io) 11, Docker (Desktop or OrbStack).

### Fastest path — watch the wedge run end-to-end (~2 min)

```bash
git clone https://github.com/auto-nomos/nomos.git
cd nomos
corepack enable && corepack prepare pnpm@11.0.8 --activate

pnpm install
pnpm db:up        # boots Postgres 17 on host port 5433
pnpm demo         # mints a UCAN, proxies through the PDP to a mock GitHub
```

`pnpm demo` boots the control-plane and PDP in-process, signs up an organization,
creates a Cedar policy, mints a proxy-bound UCAN, and exercises both an allowed and
a denied call — proving the OAuth token never leaves the PDP.

### Full local stack in Docker

Brings up Postgres, Redis, the control-plane (`:8788`), the PDP (`:8787`), and the
dashboard (`:3000`) with hot reload:

```bash
pnpm dev:setup    # one-shot: generates secrets + .env.local, runs migrations
pnpm dev:up       # boots all services (add -d to detach)
```

Then open the dashboard at <http://localhost:3000>. Health checks:

```bash
curl -fsS http://localhost:8788/healthz && echo " control-plane OK"
curl -fsS http://localhost:8787/healthz && echo " pdp OK"
```

Stop with `pnpm dev:down`; wipe volumes with `pnpm dev:reset`. To connect a real
Claude Desktop or Cursor, see [`packages/mcp-server`](packages/mcp-server/README.md).
For wiring external OAuth providers (GitHub, Slack, Google, Notion) and optional
services, follow [docs/DEV_SETUP.md](docs/DEV_SETUP.md).

## Packages & SDKs

Everything publishable ships from this monorepo. npm packages live under the
[`@auto-nomos`](https://www.npmjs.com/org/auto-nomos) scope; the Python SDK is
mirrored to a standalone repo for PyPI publishing.

### Install what you need

```bash
# TypeScript SDK — authorize agent actions from your own code
pnpm add @auto-nomos/sdk

# Run a Credential-Broker-backed MCP server (Claude Desktop / Cursor / ChatGPT)
npx @auto-nomos/mcp-server

# The cb CLI — setup wizard + agent-client wiring
npx @auto-nomos/cli            # exposes the `nomos` / `cb` commands

# Python SDK
pip install nomos-sdk
```

### npm packages ([`@auto-nomos/*`](https://www.npmjs.com/org/auto-nomos))

| Package | What it is |
|---|---|
| [`@auto-nomos/sdk`](https://www.npmjs.com/package/@auto-nomos/sdk) | TypeScript SDK for MCP-server developers — calls the PDP, fail-closed by default |
| [`@auto-nomos/mcp-server`](https://www.npmjs.com/package/@auto-nomos/mcp-server) | Distributable MCP server backed by the broker — wire into Claude Desktop, Cursor, ChatGPT |
| [`@auto-nomos/cli`](https://www.npmjs.com/package/@auto-nomos/cli) | `nomos` / `cb` command-line: setup wizard, agent-client connect, cloud install |
| [`@auto-nomos/adapters`](https://www.npmjs.com/package/@auto-nomos/adapters) | YAML-driven adapter framework for SaaS integrations |
| [`@auto-nomos/schema-packs`](https://www.npmjs.com/package/@auto-nomos/schema-packs) | Per-integration request validators + policy templates |
| [`@auto-nomos/policy-builder`](https://www.npmjs.com/package/@auto-nomos/policy-builder) | Visual policy IR ↔ Cedar round-trip engine |
| [`@auto-nomos/audit-verify`](https://www.npmjs.com/package/@auto-nomos/audit-verify) | Offline verifier for the Ed25519-signed audit chain |
| [`@auto-nomos/cedar`](https://www.npmjs.com/package/@auto-nomos/cedar) | Cedar-wasm wrapper with project conventions |
| [`@auto-nomos/ucan`](https://www.npmjs.com/package/@auto-nomos/ucan) | `@ucanto`-based UCAN mint / attenuate / validate |
| [`@auto-nomos/ucan-cli`](https://www.npmjs.com/package/@auto-nomos/ucan-cli) | Command-line UCAN inspection + signing |
| [`@auto-nomos/crypto`](https://www.npmjs.com/package/@auto-nomos/crypto) | `@noble`-backed crypto + DID utilities (the only crypto entrypoint) |
| [`@auto-nomos/core`](https://www.npmjs.com/package/@auto-nomos/core) | End-to-end `decide()` authorization function |
| [`@auto-nomos/shared-types`](https://www.npmjs.com/package/@auto-nomos/shared-types) | Zod schemas + shared TypeScript types |
| [`@auto-nomos/redaction`](https://www.npmjs.com/package/@auto-nomos/redaction) | Secret/PII redaction for audit payloads |

### Python ([PyPI](https://pypi.org/project/nomos-sdk/) · source [`auto-nomos/python-packages`](https://github.com/auto-nomos/python-packages))

| Package | What it is |
|---|---|
| [`nomos-sdk`](https://pypi.org/project/nomos-sdk/) | Python SDK — scoped, time-bound, revocable permissions for MCP / LangGraph / CrewAI / AutoGen |

The Python source lives in [`packages/sdk-python`](packages/sdk-python) here and is
mirrored to [`auto-nomos/python-packages`](https://github.com/auto-nomos/python-packages),
which publishes to PyPI on a `sdk-v*` tag.

## Related repositories

| Repo | Purpose |
|---|---|
| [`auto-nomos/nomos`](https://github.com/auto-nomos/nomos) | This monorepo — platform, SDKs, MCP server, CLI, docs |
| [`auto-nomos/nomos-terraforms`](https://github.com/auto-nomos/nomos-terraforms) | Terraform modules for federated cloud IAM bootstrap (Azure / AWS / GCP). Mirrored from [`infra/terraform`](infra/terraform) |
| [`auto-nomos/python-packages`](https://github.com/auto-nomos/python-packages) | Standalone PyPI publish source for `nomos-sdk` |

## Monorepo layout

```
nomos/
├── apps/
│   ├── control-plane/     # Hono + tRPC API server
│   ├── pdp/               # Hono Policy Decision Point runtime
│   ├── dashboard/         # Next.js 15 admin console
│   ├── oidc-issuer/       # OIDC issuer for federated cloud IAM
│   └── egress-proxy/      # Observe-only egress proxy
├── packages/              # Published @auto-nomos/* + nomos-sdk (Python)
│   ├── sdk-typescript/    # @auto-nomos/sdk
│   ├── sdk-python/        # nomos-sdk (mirrored to auto-nomos/python-packages)
│   ├── mcp-server/        # @auto-nomos/mcp-server
│   ├── cli/               # @auto-nomos/cli (nomos / cb)
│   ├── adapters/          # YAML-driven SaaS adapter framework
│   ├── schema-packs/      # per-integration validators + templates
│   ├── policy-builder/    # visual policy IR ↔ Cedar
│   ├── audit-verify/      # offline audit-chain verifier
│   ├── cedar/ ucan/ ucan-cli/ crypto/ core/ shared-types/ redaction/ rbac/
├── infra/
│   └── terraform/         # cloud IAM bootstrap modules → auto-nomos/nomos-terraforms
├── infrastructure/
│   ├── docker/            # local dev + swarm compose stacks
│   ├── helm/cb-pdp/       # Helm chart for self-hosted PDP
│   └── azure/             # VM deploy + SSL scripts
├── examples/              # runnable MCP / swarm reference servers
└── docs/                  # guides, ADRs, self-hosting, RBAC, security
```

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

## Tech stack

- TypeScript on Node.js 22 LTS
- Hono (PDP + control plane), tRPC, Better-Auth
- Drizzle ORM + Postgres
- [`@ucanto/core`](https://github.com/storacha/ucanto) (UCAN v1.0) and [`@cedar-policy/cedar-wasm`](https://www.cedarpolicy.com/)
- [`@noble/curves`](https://github.com/paulmillr/noble-curves) + `@noble/hashes` (all crypto)
- Next.js 15 App Router + shadcn/ui + Tailwind
- pnpm + Turborepo + Biome + Vitest

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) — it takes you
from a fresh clone to a green `pnpm verify` and a reviewable PR, and documents the
project conventions (crypto goes through one package, multi-tenancy is non-negotiable,
adapters are YAML-first, visual policies must round-trip).

- **Code of Conduct:** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- **Security:** report vulnerabilities privately — see [SECURITY.md](SECURITY.md)
- **Architecture decisions:** [docs/adr/](docs/adr)
- **Questions:** [GitHub Discussions](https://github.com/auto-nomos/nomos/discussions) or the [Discord](https://discord.gg/cKkWQV7B)

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
