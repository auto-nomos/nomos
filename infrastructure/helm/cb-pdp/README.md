# cb-pdp Helm chart

Stateless customer-edge Credential Broker PDP. Fetches signed policy
bundles from a remote control plane over HTTPS; runs decisions locally
so latency stays inside the customer's perimeter.

## Architecture

```
[customer cluster]                        [credentialbroker.dev SaaS]
  ┌────────────────┐  signed bundles       ┌──────────────────────┐
  │ cb-pdp (this)  │ ◄────────────────────►│ control plane        │
  │ /v1/proxy etc  │  service token        │ - mints UCANs        │
  └───────┬────────┘                       │ - holds OAuth tokens │
          │ borrowed token                 │ - audit hash chain   │
          ▼                                └──────────────────────┘
   [SaaS APIs]
```

Audit can land locally (jsonl on tmpfs) or in the customer's own Postgres.
The PDP never holds OAuth refresh tokens — only short-lived access tokens
fetched per-request from the control plane.

## Install

```bash
helm install pdp ./infrastructure/helm/cb-pdp \
  --namespace cb-pdp --create-namespace \
  --set image.repository=ghcr.io/varendra007/cb-pdp \
  --set image.tag=latest \
  --set controlPlane.url=https://api.credentialbroker.dev \
  --set secret.controlPlaneServiceToken=$CB_TOKEN \
  --set secret.bundleVerifyKey=$CB_VERIFY_KEY
```

Required values: `secret.controlPlaneServiceToken` and
`secret.bundleVerifyKey`. The chart will fail to render without them.

## Defaults

- 2 replicas, ClusterIP only (set `ingress.enabled` to expose).
- Read-only root filesystem, non-root UID 1000.
- Audit jsonl on emptyDir (lost on pod restart). Set
  `audit.backend=postgres` + `audit.databaseUrl` for durability.
- Customer set discovered from control plane every 60s; override with
  `customerIdsOverride` for air-gapped operation.

## Cloudflare Workers variant — deferred

The PDP transitively imports `pg` for the postgres audit backend, which
isn't compatible with the Workers runtime. Workers support requires:

1. Audit backend that POSTs events to the control plane over HTTPS
   instead of writing to Postgres directly.
2. Replacing `pino` + `@opentelemetry/sdk-node` with Workers-compatible
   alternatives.

Tracked as a separate Phase 2 effort.
