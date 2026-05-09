#!/usr/bin/env bash
#
# Start a cloudflared quick tunnel that exposes the local control-plane
# at a public https://<random>.trycloudflare.com URL. Sprint 5 OAuth
# callbacks require a publicly reachable URL — providers cannot reach
# localhost. Use the printed URL when you configure GitHub / Slack /
# Google / Notion OAuth app callback paths in dev.
#
# Usage:
#   scripts/dev-tunnel.sh                # default: http://localhost:8788
#   PORT=3000 scripts/dev-tunnel.sh      # different upstream port
#
# Requires `cloudflared` on PATH:
#   brew install cloudflare/cloudflare/cloudflared   (macOS)
#   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/installation/
set -euo pipefail

PORT="${PORT:-8788}"
URL="http://localhost:${PORT}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found on PATH." >&2
  echo "Install:" >&2
  echo "  macOS:  brew install cloudflare/cloudflare/cloudflared" >&2
  echo "  other:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/installation/" >&2
  exit 127
fi

echo "Tunneling ${URL} via cloudflared quick tunnel..." >&2
echo "Look for a https://*.trycloudflare.com URL below — that is your public callback host." >&2
echo "" >&2

exec cloudflared tunnel --no-autoupdate --url "${URL}"
