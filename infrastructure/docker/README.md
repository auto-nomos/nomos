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

Sprint 5 introduces OAuth providers (GitHub, Slack, Google, Notion) which require a public callback URL. Providers cannot reach `localhost`, so we put a cloudflared quick tunnel in front of the control-plane:

```bash
pnpm db:up                                            # start postgres
pnpm --filter @auto-nomos/control-plane dev    # control-plane on :8788
pnpm tunnel                                           # cloudflared quick tunnel
# look for https://<random>.trycloudflare.com in the cloudflared output
```

Use the printed `https://*.trycloudflare.com` URL as the **OAuth callback host** when configuring dev OAuth apps:

| Provider | Callback path |
|---|---|
| GitHub | `/v1/oauth/callback/github` |
| Slack | `/v1/oauth/callback/slack` |
| Google | `/v1/oauth/callback/google` |
| Notion | `/v1/oauth/callback/notion` |

Set `CONTROL_PLANE_PUBLIC_URL` in your control-plane `.env.local` to the tunnel URL so generated auth-URLs include the matching `redirect_uri`.

`cloudflared` is not in compose because quick tunnels are intended for short-lived dev sessions and rotate URLs on each run; running it as a foreground task in your shell keeps the lifecycle obvious. Install: `brew install cloudflare/cloudflare/cloudflared`.

## Pre-Sprint-3 prereqs

- Docker Desktop or OrbStack installed: `docker --version` works.
- Host port 5433 free (compose maps host `5433` → container `5432` so a host-installed postgres on 5432 keeps working). Check: `lsof -nP -iTCP:5433 -sTCP:LISTEN`.
