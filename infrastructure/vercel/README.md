# Vercel — Nomos dashboard deploy

The dashboard (`apps/dashboard`) ships on Vercel; the control plane and PDP run
on the Azure VM (see `infrastructure/azure/`). This split is per the wedge-
sprint plan: Vercel handles the marketing surface + authenticated dashboard;
the Azure VM keeps the credential-bearing services on infrastructure we own.

## One-time setup

```sh
# 1. Link the project (run once per machine; creates .vercel/project.json)
cd apps/dashboard
vercel link --yes --scope <team>

# 2. Set root directory to apps/dashboard, framework to Next.js
#    (the dashboard's own vercel.json supersedes the root one)
vercel project ls    # confirm
```

The build command in `infrastructure/vercel/vercel.json` walks back to the
monorepo root because Vercel's Next.js detection ignores pnpm workspaces by
default. The `cd ../.. && pnpm install ...` pattern is the documented
workspace escape hatch (https://vercel.com/docs/projects/monorepos/pnpm).

## Production environment variables

Set via `vercel env add` for each scope (`production`, `preview`, `development`):

| Var | Scope | Value (prod) |
| --- | --- | --- |
| `NEXT_PUBLIC_CONTROL_PLANE_URL` | all | `https://api.auto-nomos.com` |
| `NEXT_PUBLIC_PDP_URL` | all | `https://pdp.auto-nomos.com` |
| `BETTER_AUTH_SECRET` | production | rotate per env; 32+ bytes |
| `BETTER_AUTH_URL` | production | `https://app.auto-nomos.com` |
| `DATABASE_URL` | production | Neon pooled URL (server-side only) |

Use `vercel env pull .env.local` on the workstation to sync.

## Custom domain

```sh
vercel domains add app.auto-nomos.com
# Vercel prints the CNAME target — add it in DNS (see infrastructure/azure/dns.md).
```

## Build verification

```sh
vercel build      # local prod build
vercel deploy --prebuilt --prod
```

Vercel preview deploys run on every push to a non-main branch; PR comments
include the preview URL. Per design appendix D9 (brand): preview domains
should NOT be embedded in marketing copy.
