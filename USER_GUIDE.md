# Nomos — User Guide

> **The live, screenshot-rich, step-by-step guide is at
> [docs.auto-nomos.com](https://app.auto-nomos.com/docs).**

The `USER_GUIDE.md` that used to live here was archive-friendly but hard to keep in
sync with the product. The MDX source for every doc page now lives in
`apps/dashboard/content/docs/` and renders at both:

- **Public** (no login): `https://app.auto-nomos.com/docs/<journey>/<page>`
- **In-product** (auth-gated, same content): `https://app.auto-nomos.com/app/guide/<journey>/<page>`

## Read the docs by journey

1. [**Get started**](https://app.auto-nomos.com/docs/get-started/what-is-nomos) — sign up,
   connect a provider, ship your first call. ~15 min.
2. [**Connect agents**](https://app.auto-nomos.com/docs/connect/cursor) — Cursor, Claude
   Desktop, Claude Code, Codex, raw MCP, TypeScript SDK, Python SDK, Telegram.
3. [**Connect providers**](https://app.auto-nomos.com/docs/providers/overview) — 12
   providers, one tutorial each.
4. [**Author policies**](https://app.auto-nomos.com/docs/policies/templates) — templates,
   visual builder, Cedar, step-up, swarms.
5. [**Operate**](https://app.auto-nomos.com/docs/operate/api-keys) — keys, audit chain,
   RBAC, invites, self-host.

## Why move docs to the dashboard

- Screenshots can ship without git churn.
- Non-engineers (designers, support, founders) can write prose.
- The same MDX serves the public docs site and the in-product guide — content can't
  drift between contexts.
- SEO + sitemap + Open Graph all generated from MDX frontmatter.

To contribute docs, edit MDX under `apps/dashboard/content/docs/` and open a PR.
Screenshot manifest: `apps/dashboard/SCREENSHOTS.md`.
