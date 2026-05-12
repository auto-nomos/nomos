#!/usr/bin/env bash
# Nomos — production preflight.
#
# Asserts that every secret required by the control plane + PDP is set
# AND non-default before a deploy. Run before infrastructure/azure/deploy.sh.
#
# Exit codes:
#   0 = ready
#   1 = missing or default value detected (deploy WILL fail-closed)
#   2 = script invocation error

set -uo pipefail

ENV_FILE="${1:-/opt/nomos/app/.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "preflight: env file not found at $ENV_FILE" >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

errors=0
warn() { echo "preflight: WARN  $*"; }
fail() { echo "preflight: FAIL  $*"; errors=$((errors + 1)); }
ok()   { echo "preflight: OK    $*"; }

require_nonempty() {
  local name="$1"
  local val="${!1:-}"
  if [[ -z "$val" ]]; then
    fail "$name is empty"
  else
    ok "$name set"
  fi
}

require_not_default() {
  local name="$1"
  local default="$2"
  local val="${!1:-}"
  if [[ "$val" == "$default" ]]; then
    fail "$name still set to development default ($default)"
  else
    ok "$name overridden"
  fi
}

# ── Database (Neon) ───────────────────────────────────────────────────────────
require_nonempty DATABASE_URL
require_nonempty DATABASE_DIRECT_URL
require_not_default DATABASE_URL "postgres://cb:cb@localhost:5433/cb_dev"

# ── Auth (Better-Auth) ────────────────────────────────────────────────────────
require_nonempty BETTER_AUTH_SECRET
require_nonempty BETTER_AUTH_URL
if [[ "${BETTER_AUTH_URL:-}" =~ ^http:// ]]; then
  fail "BETTER_AUTH_URL must be https in production (got: $BETTER_AUTH_URL)"
fi

# ── Crypto roots ──────────────────────────────────────────────────────────────
require_nonempty SECRETBOX_KEY_HEX
require_nonempty AUDIT_SIGNING_PRIVATE_KEY_HEX
require_nonempty AUDIT_SIGNING_PUBLIC_KEY_HEX
if [[ "${SECRETBOX_KEY_HEX:-}" == *"deadbeef"* ]]; then
  fail "SECRETBOX_KEY_HEX still contains a placeholder pattern"
fi

# ── R2 audit archive ──────────────────────────────────────────────────────────
require_nonempty R2_AUDIT_BUCKET
require_nonempty R2_AUDIT_ACCESS_KEY_ID
require_nonempty R2_AUDIT_SECRET_ACCESS_KEY
require_nonempty R2_AUDIT_ENDPOINT

# ── OAuth providers (require at least github for the wedge) ───────────────────
require_nonempty GITHUB_CLIENT_ID
require_nonempty GITHUB_CLIENT_SECRET
if [[ "${GITHUB_CLIENT_ID:-}" == *"xxx"* ]]; then
  fail "GITHUB_CLIENT_ID looks like a placeholder"
fi

# ── Knock + Telegram (warn-only; dashboard works without them) ────────────────
if [[ -z "${KNOCK_API_KEY:-}" ]]; then
  warn "KNOCK_API_KEY empty — step-up will fall through to the dev console logger"
fi
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  warn "TELEGRAM_BOT_TOKEN empty — Telegram soft-approval disabled"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
if [[ $errors -gt 0 ]]; then
  echo
  echo "preflight: $errors blocking issue(s). Fix $ENV_FILE before deploying."
  exit 1
fi
echo
echo "preflight: ready to deploy."
exit 0
