# `@auto-nomos/schema-packs`

Per-provider schema packs — starter Cedar policy templates + resource models + action
vocabularies — that the dashboard, MCP server, and policy builder all read.

Most users never `import` from this package directly; the dashboard surfaces every
template under **Policies → New → From template**. Use this package if you're:

- Embedding the visual policy builder in your own app.
- Authoring a new provider adapter.
- Auditing what every starter template actually does.

## Install

```bash
pnpm add @auto-nomos/schema-packs
```

## API

```ts
import {
  PACKS,
  listTemplates,
  templateById,
  templatesFor,
  resourceModelFor,
  actionsFor,
} from '@auto-nomos/schema-packs';
```

- `PACKS` — every `ProviderPack` (id, name, templates, resourceModel, actions).
- `listTemplates()` — flat list of every template.
- `templatesFor('github')` — templates for one provider.
- `templateById('github:read-only')` — direct lookup.
- `resourceModelFor('github')` — the shape of `resource` for Cedar.
- `actionsFor('github')` — the canonical action vocabulary.

Each template carries a `visualReady` flag. `true` = the visual builder renders it
losslessly. `false` = the dashboard's visual tab falls back to "edit in Cedar"
because the template uses shapes outside the IR (path-to-path compares, set
operations, extension functions).

## Templates shipped today

20+ templates across 12 providers. By provider:

| Provider | Templates |
|---|---|
| `github` | `read-only`, `safe-default`, `org-pinned`, `repo-pinned` |
| `slack` | `read-only`, `safe-default`, `channel-pinned` |
| `google_drive` / `gmail` / `calendar` / `docs` / `sheets` | per sub-service `read-only` + `safe-default` |
| `notion` | `read-only`, `write-page-content` |
| `linear` | `read-only`, `safe-default`, `team-pinned` |
| `stripe` | `read-only`, `safe-default`, `billing-bot` |
| `discord` | `read-only`, `notification-bot` |
| `filesystem` | `read-only`, `subdir-read`, `write-subdir`, `extension-filter`, `delete-step-up`, `developer-sandbox` |
| `ssh` | `host-pinned-read`, `sftp-upload`, `host-subdir-full`, `exec-step-up`, `delete-step-up`, `read-write-no-exec` |
| `azure` | `read-only`, `storage-read`, `vm-operator` |
| `aws` | `s3-read`, `dynamodb-read`, `ec2-operator` |
| `gcp` | `storage-read`, `firestore-read`, `compute-operator` |
| `swarm-safe` | `forbid-deep-delegation`, `pin-root-agent`, `block-tainted-ancestor`, `require-direct-call` |

## Add a new template

1. Drop a `.cedar` file into `packages/schema-packs/src/<provider>/templates/`.
2. Add the metadata block to `packages/schema-packs/src/<provider>/index.ts`:

```ts
{
  id: 'github:my-template',
  name: 'My Template',
  description: 'One-line summary.',
  risk: 'medium',
  visualReady: true,
  cedar: () => import('./templates/my-template.cedar?raw'),
}
```

3. `pnpm -F @auto-nomos/schema-packs test`. The validator round-trips Cedar to
   visual IR and back; mismatch = test failure.
4. Open a PR.

## Add a new provider pack

1. Create `packages/schema-packs/src/<provider>/`.
2. Define `resourceModel` (the shape Cedar's `resource` should have).
3. Define `actions` (the command vocabulary — must match
   `@auto-nomos/adapters/spec/<provider>.yaml`).
4. Ship at least one template (usually `<provider>:read-only`).
5. Wire into `PACKS` in `packages/schema-packs/src/index.ts`.

## Docs

Live docs: [docs.auto-nomos.com/policies/templates](https://app.auto-nomos.com/docs/policies/templates)
Policy builder reference: [@auto-nomos/policy-builder](https://www.npmjs.com/package/@auto-nomos/policy-builder)
