# TODOS

Deferred work from `/plan-ceo-review` (2026-05-12) + `/plan-eng-review` (2026-05-12).
Items are in the wedge-sprint Hybrid path's deferred bucket. Pick up post-wedge unless
specifically promoted into a sprint.

Format: `- [Priority] What — Why — Where to start`

## From CEO plan (2026-05-12-nomos-wedge-sprint.md)

- **[P2]** Wire more OAuth providers (Linear, Jira, Stripe, Discord, Twilio) — Adapters exist as YAML in `packages/adapters/`; control-plane OAuth route needs provider config + token-refresh strategy per provider. Start: `apps/control-plane/src/routes/oauth.ts` + `packages/schema-packs/`.
- **[P2]** Customer-edge PDP install — Polish Helm chart (memory: `cb-pdp` Helm Chart) into a productized install mode. Add operator UX: env-config helper, docker-compose for non-K8s, signed container images. Start: `infrastructure/helm/cb-pdp/`.
- **[P2]** Multi-language SDK (Python first) — High demand from agent ecosystem. Mirror @auto-nomos/sdk TS API. Start: scaffold `sdks/python/` with `nomos-sdk` package; consume PDP /v1/authorize + /v1/proxy + /v1/receipts.
- **[P3]** SCIM/OIDC IdP federation — Enterprise procurement signal. Better-Auth supports OIDC providers; SCIM is custom. Start: when first enterprise lead asks; not before.
- **[P3]** Cross-org federation — Vision item from CURRENT_PRODUCT_ANALYSIS.md. Multiple orgs delegate to one PDP. Defer indefinitely.
- **[P3]** On-chain spend / ERC-7715 — Vision item. Defer indefinitely.
- **[P2]** Multi-region control plane + customer-managed keys — Defer until enterprise contract requires data residency. Memory: `Phase 2` key-rotation work.
- **[P2]** SOC2 Type I formal audit — Defer until 3 paying customers explicitly ask. Build posture-ready now (controls documented, encryption verified, incident runbook drafted). Audit firm cost ~$20-40k.
- **[P3]** GitHub Actions CI/CD pipeline — Manual deploys fine for 5 design partners. Start when ssh+pull+restart becomes painful. Pattern in `dep-temp.md`.

## From Lane B implementation (2026-05-12)

- **[P2]** Fill `actionSchemas` for remaining 7 schema-packs (slack, google, google_calendar, notion, linear, stripe, filesystem) — D3 plumbing landed with github as the reference. Packs without `actionSchemas` pass through unchanged (no breakage), but defense-in-depth coverage only fires for github until the others are filled. Pattern: `packages/schema-packs/src/<pack>/schemas.ts` mirroring `github/schemas.ts`. Tests in PDP cover the plumbing; per-pack tests should mirror the github adversarial cases (wrong-method + path-traversal).

## From eng review (2026-05-12)

- **[P3]** PolicyCache + RevocationCache LRU eviction — In-memory Map<customerId, _> grows linearly with customers. Acceptable to ~10k customers × 50KB bundle = 500MB. Add eviction when memory metric crosses 50% VM RAM. Start: `apps/pdp/src/cache/policies.ts`.
- **[P2]** npm publish for @auto-nomos/sdk + @auto-nomos/mcp-server + @auto-nomos/cli + @auto-nomos/schema-packs — Memory: deferred to Sprint 11 pending npm org provisioning. RE-CHECK during wedge sprint: if design partners need to `npm install` (not workspace tarball), this becomes blocking. Memory: `.changeset/config.json`, `pack-smoke`, `pnpm publish -r`.
- **[P2]** Prompt-injection eval suite ongoing maintenance — D10 set the bar at 20-30 adversarial cases. Update on every prompt template change. Update on Claude model upgrade. Start: `packages/core/__tests__/chain-context.eval.ts`.
- **[P2]** audit-verify CLI regression test — When `billing_meter_pending` column lands in audit_events, audit-verify must still pass. Memory: Community 70 (`audit-verify CLI entry`). Add CI step that runs verify against synthetic 1000-row chain post-migration. Start: `packages/audit-verify/__tests__/`.

## From design review (2026-05-12)

- **[P2]** Configure OpenAI API key for gstack designer — Designer binary present but unusable until `~/.claude/skills/gstack/design/dist/design setup` runs (or `OPENAI_API_KEY` set). Blocks mockup generation for landing hero, onboarding, visual builder, billing meter, audit detail, docs landing, free-tier banner, policy test panel. Start: configure key, then `/design-shotgun` per surface.
- **[P2]** /design-consultation in Lane D week 1 — Produces DESIGN.md with typography scale, color tokens (amber on slate/near-black per D9), spacing, radius, motion, component vocabulary. Calibrates W3+W4+W5 visual work. Without it AI-slop risk stays elevated.
- **[P3]** Landing CMS adoption — Defer until marketing copy iteration exceeds 1 change/week. Then evaluate Sanity / Contentful / hardcoded MDX.
- **[P3]** Mobile-first walkthrough for onboarding — Wedge data partners may sign up on mobile. Validate the 7-step flow on 375px after Lane D ships.
- **[P2]** Webauthn screen-reader announcements — Passkey enroll + auth ceremony has known a11y rough edges. Document expected announcements; test with VoiceOver + NVDA before launching self-serve.

## Process

- Update this file when proposing scope cuts or adding deferred items.
- Reference TODOs in PRs by item description (no IDs).
- Promote a TODO into a sprint by deleting it here + adding to the active plan doc.
