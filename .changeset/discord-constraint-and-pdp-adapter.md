---
'@auto-nomos/shared-types': minor
'@auto-nomos/sdk': patch
---

Discord constraint + PDP narrowing adapter — unlocks `/v1/intent` + envelope passkey gauntlet for discord.

- `DiscordConstraint` added to `ResourceConstraint` discriminated union (fields: `guild_id`, `channel_id`, `message_id`, `role_id`, `user_id`). `/v1/intent` no longer rejects discord constraints with `invalid_union_discriminator`.
- New PDP data-plane gate `apps/pdp/src/adapters/discord.ts` re-parses `apiCall.path` and rejects calls outside the constrained guild/channel/message/role/user (mirrors slack/github adapters). Wired into `apps/pdp/src/routes/proxy.ts` dispatch.
- 8 adapter tests covering each constraint axis + unparseable paths.

Closes the two follow-ups noted in `project_discord_oss_live_2026_05_23` — discord can now ride the full dynamic-intent + cosigner step-up flow.
