# `@auto-nomos/adapters`

YAML-driven adapter framework. Every Nomos-supported provider ships as a single
`spec/<id>.yaml` describing its API surface: auth, actions, params, response
sanitization. The TypeScript executor turns those specs into HTTP calls.

## Why YAML

Per-provider TypeScript connectors are 150–300 lines of mostly boilerplate. A spec
file collapses that to declarative metadata that the platform reads from:

- `auth.*` — OAuth client setup.
- `actions[].risk` — seed Cedar policy templates + step-up gates.
- `actions[].required_scopes` — derive minimal OAuth scopes.
- `actions[].http` — build the HTTP request.
- `actions[].params` — validate, default, transform inputs.
- `actions[].response.sanitize` — redact PII / secrets before returning.

This also means **adding a new provider doesn't require shipping new TS code**.

## Adapters shipped today

| id | provider | actions | scopes |
|---|---|---|---|
| `github` | GitHub | 24 | repo, read:user, read:org |
| `slack` | Slack | 18 | channels:*, chat:write, users:read |
| `google` | Google Drive | 12 | drive |
| `google_gmail` | Gmail | 8 | gmail.modify |
| `google_calendar` | Calendar | 9 | calendar |
| `google_docs` | Docs | 7 | documents |
| `google_sheets` | Sheets | 9 | spreadsheets |
| `google_tasks` | Tasks | 6 | tasks |
| `google_contacts` | Contacts | 4 | contacts |
| `notion` | Notion | 15 | n/a (workspace token) |
| `linear` | Linear | 14 | read, write |
| `stripe` | Stripe Connect | 18 | n/a (connect platform) |
| `discord` | Discord | 12 | bot, applications.commands |
| `filesystem` | local disk | 11 | n/a (host process) |
| `ssh` | SSH/SFTP | 12 | n/a (private key) |
| `azure` | Azure RM | 60+ | OIDC federation |
| `aws` | AWS | 50+ | OIDC federation (STS) |
| `gcp` | GCP | 40+ | OIDC federation (WIF) |

Full action catalogs: `pnpm cb actions <id>`.

## Authoring a new YAML adapter

Minimum spec shape:

```yaml
id: example
name: Example API
auth:
  kind: oauth2
  authorize_url: https://example.com/oauth/authorize
  token_url: https://example.com/oauth/token
  default_scopes: [read]
api_base: https://api.example.com

actions:
  - id: list_things
    description: List things.
    expected_use: Browse things to inform a decision.
    risk:
      category: read       # read | search | write | delete
      sensitivity: low     # low | medium | high
    required_scopes: [read]
    http:
      method: GET
      path: /v1/things
    params:
      limit:
        type: number
        default: 25
        max: 100
    response:
      sanitize:
        - path: items[].user.email
          rule: hash
```

Authoritative schema: `src/schema.ts` (zod).

## Transforms

`params.transform` and `default_expr` strings are parsed by a tiny whitelisted
expression evaluator (`src/transforms.ts`). Supported:

- `now()` — ISO timestamp
- `rfc3339(d)` — normalize `Date | string | number` → ISO
- `uuid()` — random UUIDv4
- `lower(s)`, `upper(s)`
- `coalesce(a, b, …)`, `default(a, b)`

Identifier access (`params.foo.bar`) descends a context object. Anything outside
the whitelist throws `TransformError` — **no eval, no arithmetic, no host calls**.

## Sanitize rules

`response.sanitize` rules redact, hash, or truncate by dotted path:

| Rule | Effect |
|---|---|
| `redact` | Replace with `[REDACTED]` |
| `hash` | Replace with `sha256:…` of value |
| `truncate(n)` | Keep first `n` chars |
| `keep_keys: [a, b]` | Drop everything except listed keys |

`items[].user.email` descends `items` array and redacts `user.email` on each.

## Wiring

The executor takes an `AdapterConnector` (any object exposing `callApi`) so the
control-plane OAuth connector slots in directly. `loadAllAdapters()` from the
package root wires every shipped spec.

## Contributing an adapter

1. Drop your `spec/<id>.yaml` into `packages/adapters/spec/`.
2. Run `pnpm -F @auto-nomos/adapters test` — the parity gate validates schema +
   that every action's path exists at the upstream.
3. Add starter Cedar templates to `packages/schema-packs/src/<id>/`.
4. Open a PR.

## Docs

Live docs: [docs.auto-nomos.com/providers/overview](https://app.auto-nomos.com/docs/providers/overview)
Schema: `packages/adapters/src/schema.ts`
