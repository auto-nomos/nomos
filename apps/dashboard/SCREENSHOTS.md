# Nomos docs — screenshot manifest

One line per screenshot. Capture, drop into `apps/dashboard/public/docs/screenshots/`,
the MDX `<Shot src="…" />` blocks pick them up automatically. All shots at 1440×900
unless noted, light theme (we'll add dark-mode swap later via `<picture>`).

Filename convention: `<surface>-<state>.png`. No spaces, lowercase, hyphens.

## Onboarding (5)

- `signup-form.png` — `/sign-up` form, blank. Capture full hero + form.
- `passkey-enroll.png` — `/onboarding/enroll-passkey` mid-flow, browser passkey prompt visible.
- `connections-empty.png` — `/app/connections` on a fresh org. No rows.
- `connections-picker-github.png` — `/app/connections` with provider picker open, GitHub tile highlighted.
- `connections-github-active.png` — `/app/connections` with one active GitHub row.

## Provider OAuth screens (7) — capture in incognito to avoid clutter

- `github-org-picker.png` — GitHub OAuth org picker mid-flow.
- `github-oauth-consent.png` — GitHub OAuth final consent screen.
- `slack-oauth-consent.png` — Slack OAuth consent screen.
- `google-oauth-consent.png` — Google OAuth consent (the seven Workspace scopes).
- `notion-page-picker.png` — Notion OAuth page picker.
- `stripe-oauth-consent.png` — Stripe Connect OAuth.
- `discord-oauth-consent.png` — Discord bot OAuth.

## Apps + keys (4)

- `apps-empty.png` — `/app/agents` with no apps.
- `apps-create-form.png` — `/app/agents/new` filled in.
- `api-key-issue-form.png` — App detail → Issue API key dialog.
- `api-key-reveal-modal.png` — Issue key reveal modal with copy button.
- `policy-assign-app.png` — App detail with Default policy dropdown open.

## Policies (3)

- `policy-templates-picker.png` — Policies → New → From template view.
- `visual-builder-canvas.png` — Visual builder mid-edit, two permits + one forbid.
- `audit-first-rows.png` — Audit page with two new rows highlighted.

## Audit (2)

- `audit-table.png` — Audit page showing 20+ rows, filters active.
- (drawer screenshot is optional v2)

## Cursor (3)

- `cursor-mcp-settings.png` — Cursor Settings → MCP panel.
- `cursor-mcp-add-server.png` — Cursor "Add server" modal pre-filled with Nomos config.
- `cursor-tool-picker-nomos.png` — Cursor chat panel with tool picker open, Nomos tools visible.
- `cursor-first-tool-call.png` — Cursor chat showing one tool call + response inline.

## Claude Desktop (3)

- `claude-desktop-config-file.png` — `claude_desktop_config.json` open in TextEdit with Nomos block highlighted.
- `claude-desktop-tools-picker.png` — Claude Desktop wrench-icon tool picker open.
- `claude-desktop-tool-call.png` — Claude Desktop chat with a github_file_get call.

## Claude Code (2)

- `claude-code-mcp-list.png` — Terminal showing `claude mcp list` output.
- `claude-code-tool-call.png` — Terminal showing Claude Code calling a tool + response.

## OpenAI Codex (2)

- `codex-config-toml.png` — `~/.codex/config.toml` open with Nomos block.
- `codex-tool-call.png` — Codex CLI showing a github_pr_create with approval pending.

## Telegram (3)

- `telegram-bot-start.png` — Telegram chat with `@NomosApprovalsBot` showing /start + one-time code.
- `dashboard-telegram-bind.png` — `/app/settings/notifications` Telegram bind dialog.
- `telegram-approval-card.png` — Telegram message with Approve/Deny buttons.

## Step-up (2)

- `dashboard-approvals-pending.png` — `/app/approvals` with pending row + countdown.
- `approve-standing-form.png` — `/approve/<id>` page with Standing toggle on.

## Standing grants (1)

- `standing-grants-list.png` — `/app/grants` with 3+ active grants.

## Cloud (3)

- `dashboard-cloud-azure-bind.png` — `/app/cloud/connect/azure` filled.
- `dashboard-cloud-aws-bind.png` — `/app/cloud/connect/aws` filled.
- `dashboard-cloud-gcp-bind.png` — `/app/cloud/connect/gcp` filled.

## Members + invites (2)

- `members-table-roledropdown.png` — `/app/settings/members` with role dropdown open.
- `invite-form.png` — Invite teammate dialog.

## Swarms (1)

- `swarms-view.png` — `/app/swarms/<id>` showing agent tree + recent receipts.

---

**Total: ~45 shots.** Capture in 1440×900 (Retina or DPR=2 is fine — Next/Image
optimizes). Crop tightly: no browser chrome unless the URL bar matters
(OAuth screens). For approval modals, capture without name/identifying info.
