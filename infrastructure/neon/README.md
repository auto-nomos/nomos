# Neon — production Postgres

Local dev uses dockerised `postgres:17` on port 5433 (see
`infrastructure/docker/docker-compose.yml`). Production uses Neon's serverless
Postgres so the Azure VM stays stateless and the dashboard on Vercel reads
the same database without a VPN.

## Provision

```sh
# 1. Create project at https://console.neon.tech
#    Region: ap-southeast-1 (closest to centralindia VM); compute: 0.25
#    Postgres version: 17 (match the local dev image)

# 2. Two branches: production + preview
neonctl branches create --name preview --project-id <pid>

# 3. Pull connection strings
neonctl connection-string --project-id <pid> --role-name nomos --database-name nomos
neonctl connection-string --project-id <pid> --pooled --role-name nomos --database-name nomos
```

Both surfaces want the **pooled URL** (PgBouncer) — Drizzle's `node-postgres`
driver and Better-Auth open a connection per request and would exhaust the
direct-connection cap inside an hour.

## Migrate

The control plane already ships a drizzle migrate entrypoint:

```sh
DATABASE_URL=$NEON_POOLED_URL \
DATABASE_DIRECT_URL=$NEON_DIRECT_URL \
pnpm --filter @auto-nomos/control-plane db:migrate
```

`DATABASE_DIRECT_URL` (unpooled) is required because Drizzle Kit runs DDL,
and PgBouncer in transaction mode does not accept `CREATE TYPE` / `CREATE
INDEX CONCURRENTLY`.

## Branch protection

- Production branch: locked from CLI deletes; auto-vacuum aggressive
- Preview branch: ephemeral copy refreshed nightly from production via
  `neonctl branches create --parent main --copy-data`
- Suspend after 5 minutes idle (default) to keep the free tier honest

## Connection limits

Neon free tier: 100 simultaneous connections per project. PgBouncer pool
size 50 by default; lift to 80 once we cross 50 customers.

## Disaster recovery

- Point-in-time restore: 7 days on free tier, 14 days on launch tier
- Audit data has its own R2 archive (`infrastructure/r2/`) so the Postgres
  retention window is not the upper bound on audit history.
