# Self-hosting the Nomos PDP

Run the Policy Decision Point (PDP) on your own infrastructure while the
Nomos SaaS control-plane manages policies, agents, OAuth grants, and the
audit hash-chain root.

```
[your cluster]                                 [api.auto-nomos.com]
  ┌──────────────────┐  signed bundles          ┌──────────────────────┐
  │ cb-pdp (this)    │ ◄───────────────────────►│ control plane        │
  │  /v1/authorize   │  service token (Bearer)  │  - UCAN mint          │
  │  /v1/proxy/:cmd  │                          │  - OAuth refresh      │
  │  /v1/receipts    │                          │  - hash-chain root    │
  └────────┬─────────┘                          └──────────────────────┘
           │ short-lived borrowed token
           ▼
     [SaaS APIs]
```

The PDP is stateless. It pulls signed policy bundles, evaluates Cedar
decisions, emits audit rows (jsonl or postgres), and proxies SaaS API
calls so the agent never holds raw OAuth tokens.

---

## Prerequisites

1. A Nomos account with at least one customer (= organization) created.
2. A **service token** for that customer. Issue via dashboard `Settings →
   Edge → Issue token` (or `POST /v1/service-tokens` once that endpoint
   ships). Treat as long-lived; rotate yearly.
3. The **bundle verify key** — Ed25519 public key (hex) the control-plane
   signs policy bundles with. Find it on the same Edge settings page.
4. Outbound HTTPS access from your edge to `api.auto-nomos.com`.

---

## Deploy mode 1 — Helm (Kubernetes)

```bash
helm install pdp ./infrastructure/helm/cb-pdp \
  --namespace cb-pdp --create-namespace \
  --set image.repository=ghcr.io/varendra007/cb-pdp \
  --set image.tag=v0.1.0 \
  --set controlPlane.url=https://api.auto-nomos.com \
  --set secret.controlPlaneServiceToken="$CB_TOKEN" \
  --set secret.bundleVerifyKey="$CB_VERIFY_KEY"
```

Opt-in extras (any combination):

| Flag | Effect |
|---|---|
| `ingress.enabled=true` | Provision Ingress; set `ingress.hosts[0].host` + tls |
| `autoscaling.enabled=true` | HPA from `minReplicas` → `maxReplicas` on CPU |
| `podDisruptionBudget.enabled=true` | PDB with `minAvailable: 1` |
| `networkPolicy.enabled=true` | Allow ingress only from `agentNamespaces`; egress to DNS + 443 |
| `serviceMonitor.enabled=true` | Prometheus Operator ServiceMonitor |
| `audit.backend=postgres` + `audit.databaseUrl=...` | Durable audit; emptyDir is the default |

A throwaway smoke against a local `kind` cluster:

```bash
bash infrastructure/helm/cb-pdp/scripts/kind-smoke.sh
```

## Deploy mode 2 — docker-compose

```bash
cp infrastructure/docker/.env.edge.example infrastructure/docker/.env.edge
$EDITOR infrastructure/docker/.env.edge        # fill in your secrets

docker compose -f infrastructure/docker/docker-compose.edge.yml \
  --env-file infrastructure/docker/.env.edge up -d

curl -fsS http://localhost:8787/healthz
```

## Deploy mode 3 — single Node binary (systemd)

Use this when you don't run Docker. Builds the PDP server bundle plus
its workspace dependencies — never the dashboard (it OOMs small VMs).

```bash
git clone https://github.com/varendra007/nomos /opt/nomos/app
cd /opt/nomos/app
pnpm install --frozen-lockfile
pnpm build:server     # builds control-plane + pdp + workspace deps
```

`/etc/systemd/system/nomos-pdp.service`:

```ini
[Unit]
Description=Nomos PDP
After=network.target

[Service]
WorkingDirectory=/opt/nomos/app/apps/pdp
Environment=NODE_ENV=production
Environment=PORT=8787
EnvironmentFile=/etc/nomos/pdp.env       # CONTROL_PLANE_URL + service token + verify key
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
User=nomos
Group=nomos

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nomos-pdp
sudo systemctl status nomos-pdp
```

---

## Verifying the deploy

A 4-step smoke that works against any mode:

```bash
PDP=http://localhost:8787       # or your ingress host

# 1. healthz
curl -fsS "$PDP/healthz"
# → {"ok":true,"ts":...}

# 2. authorize shape — must return a deny envelope with receiptId,
#    NOT a 4xx error payload.
curl -fsS -X POST "$PDP/v1/authorize" \
  -H 'content-type: application/json' \
  -H "x-cb-customer: $CUSTOMER_ID" \
  -d '{"ucan":"x.y.z","command":"/github/user/read","resource":{},"context":{}}'
# → {"allow":false,"reason":"malformed_ucan","receiptId":"<sha256>"}

# 3. proxy shape — same contract surface
curl -fsS -X POST "$PDP/v1/proxy/github/user/read" \
  -H 'content-type: application/json' \
  -H "x-cb-customer: $CUSTOMER_ID" \
  -d '{"ucan":"x.y.z","request":{"ucan":"x.y.z","command":"/github/user/read","resource":{},"context":{}},"apiCall":{"method":"GET","path":"/user"}}'
# → {"allow":false,"decision":{"reason":"malformed_ucan","receiptId":"<sha256>"},"error_code":"malformed_ucan"}

# 4. policy freshness — confirm the PDP fetched a bundle since boot
curl -fsS "$PDP/v1/_internal/policy-rev" -H "x-cb-customer: $CUSTOMER_ID"
```

For a more rigorous probe run the bundled smoke harness from any host
that can reach your PDP:

```bash
PDP_URL=http://localhost:8787 CONTROL_PLANE_URL=https://api.auto-nomos.com \
  pnpm tsx scripts/deploy-smoke.mts
```

---

## Verifying the container image signature

Every `pdp-v*` tag pushed to GHCR is signed with cosign keyless (Sigstore
OIDC). Verify before deploy:

```bash
cosign verify ghcr.io/varendra007/cb-pdp:v0.1.0 \
  --certificate-identity-regexp 'https://github.com/varendra007/nomos/.github/workflows/release-pdp-image\.yml.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The image build also publishes provenance + SBOM via buildx — inspect
with `cosign download attestation ghcr.io/varendra007/cb-pdp:v0.1.0`.

---

## Day-2 operations

### Rotate the service token

1. Dashboard → Settings → Edge → Revoke the old token, issue a new one.
2. Update `secret.controlPlaneServiceToken` (Helm) /
   `CONTROL_PLANE_SERVICE_TOKEN` (compose / systemd).
3. Rolling restart the PDP. The CP rejects the old token immediately;
   policy fetches will switch atomically.

### Rotate the bundle signing key

The CP rotates internally and serves both old + new for a 24h overlap
window. When you see the next bundle signed by the new key (visible in
`pdp.log`):

1. Pull the new `bundleVerifyKey` from the dashboard.
2. Update the secret + roll. There is no read-side migration; the PDP
   simply accepts the new signer on the next bundle.

### Switch audit backend jsonl → postgres

```bash
# Add to your env
AUDIT_BACKEND=postgres
DATABASE_URL=postgres://nomos:...@your-pg:5432/nomos_audit

# Apply migrations one-time
DATABASE_URL=... pnpm tsx scripts/setup-audit-db.mts
```

Then rolling restart. The PDP starts emitting to postgres; in-flight
jsonl writes drain to disk on shutdown so nothing is lost.

### Tune refresh cadence

| Env | Default | Notes |
|---|---|---|
| `POLICY_REFRESH_MS` | 60000 | How often to fetch the signed policy bundle |
| `REVOCATION_REFRESH_MS` | 5000 | How often to fetch the revocation list |
| `AUDIT_FLUSH_INTERVAL_MS` | 100 | jsonl/postgres flush cadence |
| `AUDIT_BATCH_SIZE_MAX` | 100 | Rows per flush batch |

Lower revocation interval = faster propagation of `cb revoke <agent>`
but more CP RPS. 5 s is the floor we recommend.

### Observability

The PDP exposes OpenTelemetry traces + metrics out of the box. Set:

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.your-collector:4318
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer <token>
OTEL_SERVICE_NAME=cb-pdp
```

If you run the Prometheus Operator, `serviceMonitor.enabled=true` in
the Helm chart hooks scrape config automatically.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `reason: unknown_command` | PDP has a stale schema-packs build; rebuild + restart |
| `reason: pdp_invalid_response` | SDK got a deny envelope without `receiptId`; upgrade SDK to ≥ 0.1.8 |
| `error_code: missing_customer_id` | Forgot `x-cb-customer` header or UCAN `meta.customer_id` |
| `error_code: schema_violation` | apiCall payload doesn't match the YAML-derived shape; check `apiCall.method` + `apiCall.path` |
| Pods OOM on `next-build` | Never run `pnpm -r build` on the edge; use `pnpm build:server` |
| Bundle fetch loop "unauthorized" | Service token revoked or pointed at the wrong customer |
| `cosign verify` fails | Image was pulled from a different registry than the signature |
