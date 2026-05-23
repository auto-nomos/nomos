# @auto-nomos/shared-types

## 0.1.0

### Minor Changes

- Discord bot-install integration at github/slack parity (22 actions).

  - `packages/adapters/spec/discord.yaml` rewritten from 5 user-OAuth actions to 22 bot-scoped actions across guild, channel, message, role, member, invite, webhook, emoji surfaces.
  - New `discord` schema-pack in `packages/schema-packs/src/discord/` with hand-curated `apiCallSchema` overrides (post_message requires content|embeds|components; create_channel whitelists type ∈ {0,2,4,5}; set_channel_permissions enforces type ∈ {0,1}) plus 5 policy templates (`read-only`, `read-and-write`, `step-up-write`, `moderation-only`, `time-bounded`).
  - Discord moved from `PACKLESS_ADAPTERS` to `PACK_TO_ADAPTER`; parity gate now exits clean with 14 packs / 24 YAML adapters.
  - New OAuth2 bot-install connector at `apps/control-plane/src/oauth/connectors/discord.ts`. Scope = `bot applications.commands`, permissions bitfield = `1644971949559` (manage channels/roles/messages/webhooks/emojis + send/view/invite/history/react). API calls use `Authorization: Bot <token>` against `https://discord.com/api/v10`. `accountId` = installed guild's snowflake. The static bot token is read from `OAUTH_DISCORD_BOT_TOKEN` at exchange time and stored as the connection's `accessToken`; the user access_token from the OAuth response is discarded. Bot tokens do not expire; `refresh()` always throws (re-auth required).
  - New env vars: `OAUTH_DISCORD_CLIENT_ID`, `OAUTH_DISCORD_CLIENT_SECRET`, `OAUTH_DISCORD_BOT_TOKEN`.
  - `discord` added to `ImplementedConnectorId`, `ALL_CONNECTOR_IDS`, `OAUTH_FLOW_CONNECTORS`, mcp-server `SUPPORTED_INTEGRATIONS` + REGISTRY, schema-packs `PACKS`, dashboard connector label map.
  - Resource-mismatch extraction (`src/discord/path.ts` + `extract.ts`) parses guild/channel/message/role/user ids from URL paths; `COMPARED_KEYS` extended with `guild_id`, `role_id`.
  - Smoke harness `scripts/prod-discord-mutate.mts` exercises list/create/post/list/delete + audit chain check against prod with passkey step-up on every mutation.

## 0.0.1

### Patch Changes

- Republish: the initial 0.0.0 tarballs shipped with literal `workspace:*` strings
  in `dependencies` because they were published via `npm publish` instead of
  `pnpm publish`. npm install rejects `workspace:*` (`EUNSUPPORTEDPROTOCOL`).
  0.0.1 is the same code, republished via `pnpm publish -r` so workspace ranges
  get rewritten to real semver (`^0.0.1`). 0.0.0 versions deprecated on registry.
