# R2 — audit archive bucket

Sprint 8 hour-by-hour audit Parquet archive lives in a Cloudflare R2 bucket.

## Buckets

| Env | Bucket name | Notes |
|-----|-------------|-------|
| dev | `cb-audit-archive-dev` | Sprint 8 default; control plane writes here when R2_AUDIT_* env vars are set. |
| prod | `cb-audit-archive-prod` | Provisioned in Sprint 11. |

## Object layout

```
<customer_id>/<yyyy>/<mm>/<dd>/<hh>.parquet
```

Schema mirrors `audit_events`. `resource` and `context` are JSON-stringified
into UTF8 columns.

## Retention

7 years (compliance requirement). Implemented as an R2 lifecycle rule —
`lifecycle.json` in this directory.

Apply once per bucket per environment:

```sh
wrangler r2 bucket lifecycle put cb-audit-archive-dev --rule ./infrastructure/r2/lifecycle.json
# Sprint 11 (prod):
# wrangler r2 bucket lifecycle put cb-audit-archive-prod --rule ./infrastructure/r2/lifecycle.json
```

`220924800` seconds = 2557 days = ~7 years.

The second rule cleans up aborted multipart uploads after 7 days so a crash
mid-upload doesn't accumulate billable garbage.

## Required control-plane env

```
R2_AUDIT_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_AUDIT_BUCKET=cb-audit-archive-dev
R2_AUDIT_ACCESS_KEY_ID=...
R2_AUDIT_SECRET_ACCESS_KEY=...
```

When any of these are blank the archive worker is disabled (Postgres
`audit_events` still keeps every event).
