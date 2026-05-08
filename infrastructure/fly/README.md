# Fly.io app definitions

One `*.toml` per Fly app. Deploy with:

```bash
fly deploy --config infrastructure/fly/<app>.toml --remote-only
```

## Apps

- `pdp.toml` — PDP runtime (`cb-pdp-dev` in IAD). 256MB shared CPU, autoscale 1-3 (Sprint 12 sets the upper bound).
- `control-plane.toml` — Sprint 3.

## Required secrets per app

### pdp

```bash
fly secrets set --config infrastructure/fly/pdp.toml \
  CONTROL_PLANE_URL=https://cb-control-plane-dev.fly.dev \
  CONTROL_PLANE_SERVICE_TOKEN=<from-1password>
```

`AUDIT_LOG_PATH` is set in `[env]` (it points at `/tmp/audit.log` inside the container, which is fine for Phase 1; Sprint 8 swaps for Postgres + S3).

## First-time setup

```bash
fly auth login
fly apps create cb-pdp-dev --org <org>
fly deploy --config infrastructure/fly/pdp.toml --remote-only
```
