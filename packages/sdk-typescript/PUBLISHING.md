# Publishing `@auto-nomos/sdk`

> **Sprint 11 task.** This document describes the dry-run + publish flow that
> will be exercised once npm org provisioning lands. Until then, no real
> publishes happen — author changesets only.

## Prerequisites (Sprint 11)

- npm org `@credential-broker` exists and the publishing CI bot is a member
  with `publish` permission.
- `NPM_TOKEN` (granular access token, scoped to `@auto-nomos/sdk` and
  any other public packages) configured as a GitHub Actions secret.

## Dry-run (any sprint)

```bash
# 1. Inspect what would be released:
pnpm changeset status

# 2. Generate version bumps + changelog locally without publishing:
pnpm changeset version --snapshot dry-run

# 3. Pack the tarball that would be uploaded:
pnpm --filter @auto-nomos/sdk pack
```

The pack output (`credential-broker-sdk-<version>.tgz`) is the exact artifact
npm would publish. Inspect with `tar tzf` to confirm only `dist/` and
`README.md` are bundled.

## Publish (Sprint 11)

```bash
pnpm install
pnpm build --filter @auto-nomos/sdk^...
pnpm changeset version           # writes version bumps to package.json + CHANGELOG.md
pnpm changeset publish           # uploads to npm
```

The first release goes out as `@auto-nomos/sdk@0.1.0-alpha.1` per the
v2 plan task 11.10.

## What doesn't get published

- `@auto-nomos/control-plane`, `@auto-nomos/pdp` — internal apps,
  ignored in `.changeset/config.json`.
- `@auto-nomos/example-mcp-github` — reference example, also ignored.
- Workspace-only foundation packages (`crypto`, `ucan`, `cedar`, `core`,
  `shared-types`) — currently `private: true`. If we ever publish them
  separately, change `private` to `false` and remove from the ignore list.
