# @auto-nomos/adapters

YAML-driven adapter framework. Each integration ships as a single `spec/<id>.yaml`
file describing the upstream API: auth, actions, params, response shape, and
sanitization rules. The TypeScript executor turns those specs into HTTP calls
and applies sanitize rules before returning.

## Why YAML

Per-provider TS connectors (`apps/control-plane/src/oauth/connectors/*.ts`)
are 150–200 LOC of mostly boilerplate. A spec file collapses that to
declarative metadata; the platform reads:

- `auth.*` — to drive OAuth client setup
- `actions[].risk` — to seed Cedar policy templates and gate step-up
- `actions[].required_scopes` — to derive minimal OAuth scopes
- `actions[].http` — to build the HTTP request
- `actions[].params` — to validate, default, and transform inputs
- `actions[].response.sanitize` — to redact PII / secrets before returning

## Spec shape

See `src/schema.ts` for the authoritative zod schema. Minimum:

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
      category: read   # read | search | write | delete
      sensitivity: low # low | medium | high
    http:
      method: GET
      path: /v1/things
```

## Transforms

Param `transform` and `default_expr` strings are parsed by a tiny whitelisted
expression evaluator (`src/transforms.ts`). Supported functions:

- `now()` — ISO timestamp
- `rfc3339(d)` — normalize Date | string | number → ISO
- `uuid()` — random UUIDv4
- `lower(s)` / `upper(s)`
- `coalesce(a, b, …)` / `default(a, b)`

Identifier access (`params.foo.bar`) descends a context object. Anything
outside this whitelist throws `TransformError` — no eval, no arithmetic, no
host calls.

## Sanitize

`response.sanitize` rules redact, hash, or truncate fields by dotted path.
`items[].user.email` descends the `items` array and redacts `user.email` on
each element.

## Wiring

Executor takes an `AdapterConnector` (any object exposing `callApi`) so the
existing OAuth connector at `apps/control-plane/src/oauth/connector.ts` can
be passed directly. M3 wires `loadAllAdapters()` into the control-plane
connector registry.
