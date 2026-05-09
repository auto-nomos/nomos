# infrastructure/docker — local dev stack

`docker-compose.yml` here runs everything we can't reasonably run in-process for local development. Per the v2 plan (`~/.claude/plans/wobbly-discovering-pascal.md`), the only thing in compose is **Postgres 17**. Control-plane and PDP run as host Node processes (`pnpm dev`) for fast iteration.

## Quick start

```bash
pnpm db:up      # start postgres
pnpm db:down    # stop postgres (data preserved)
pnpm db:reset   # destroy data + recreate (drops the cb_pgdata volume)
pnpm db:logs    # tail postgres logs
```

Postgres listens on `localhost:5433` with credentials `cb / cb` and database `cb_dev`.

`DATABASE_URL=postgres://cb:cb@localhost:5433/cb_dev` is the local-dev default. The same env var in production (Sprint 11) points at Neon.

## Verify

```bash
pnpm db:up
psql "postgres://cb:cb@localhost:5433/cb_dev" -c 'select version();'
# expect PostgreSQL 17.x
```

## Why postgres only

- App processes (control-plane, PDP) run on the host so Vitest watch + hot reload are instant.
- Other infrastructure pieces are not in compose:
  - Sprint 8 audit archive talks to a real Cloudflare R2 dev bucket (not LocalStack).
  - Sprint 9 Knock has a console-log fallback when `KNOCK_API_KEY` is empty.
  - Sprint 11 (deploy sprint) provisions everything else in cloud.

## Cloud parity

Production uses different services behind the same env vars. App code never references "Neon" or "Fly" directly — only env vars.

| env | local docker | prod (Sprint 11) |
|---|---|---|
| `DATABASE_URL` | `postgres://cb:cb@localhost:5433/cb_dev` | Neon pooled URL |
| `DATABASE_DIRECT_URL` | same as above | Neon non-pooled URL (Drizzle Kit) |
| `CONTROL_PLANE_URL` | `http://localhost:8788` | `https://control.<domain>` |
| `AUDIT_LOG_PATH` (Sprint 2/8) | `./audit.log` | `/data/audit.log` (Fly volume) |

## Sprint 5 OAuth callbacks

Sprint 5 introduces OAuth providers (GitHub, Slack, Google, Notion) which require a public callback URL. Use `cloudflared` (see `scripts/dev-tunnel.sh`) to expose `localhost:8788` as `https://<random>.trycloudflare.com`. The compose file does not run cloudflared — start it separately with `pnpm tunnel`.

## Pre-Sprint-3 prereqs

- Docker Desktop or OrbStack installed: `docker --version` works.
- Host port 5433 free (compose maps host `5433` → container `5432` so a host-installed postgres on 5432 keeps working). Check: `lsof -nP -iTCP:5433 -sTCP:LISTEN`.
