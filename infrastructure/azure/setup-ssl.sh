#!/usr/bin/env bash
# Nomos — Certbot SSL bootstrap for api/pdp on the Azure VM.
# Idempotent: re-running renews certs in-place; safe to schedule via cron.
#
# Prereqs:
#   - DNS A records for api.auto-nomos.com and pdp.auto-nomos.com pointing at
#     this VM (see infrastructure/azure/dns.md).
#   - infrastructure/azure/nginx.conf already deployed to /etc/nginx/conf.d/.
#   - Port 80 + 443 open in the Azure NSG.
#
# Run on the VM (as root):
#   curl -fsSL https://raw.githubusercontent.com/auto-nomos/nomos/main/infrastructure/azure/setup-ssl.sh | bash

set -euo pipefail

DOMAINS=(api.auto-nomos.com pdp.auto-nomos.com id.auto-nomos.com)
EMAIL="admin@auto-nomos.com"   # certbot expiry warnings go here

log() { echo "[$(date '+%H:%M:%S')] nomos-ssl: $*"; }

# ── 1. Install certbot (nginx plugin) ─────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  log "Installing certbot..."
  DEBIAN_FRONTEND=noninteractive apt-get update -y -q 2>&1 | tail -3
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q certbot python3-certbot-nginx 2>&1 | tail -3
fi

# ── 2. DNS sanity ─────────────────────────────────────────────────────────────
VM_IP=$(curl -fsSL https://api.ipify.org)
log "VM public IP: ${VM_IP}"
for d in "${DOMAINS[@]}"; do
  RESOLVED=$(getent hosts "$d" | awk '{print $1}' | head -1 || true)
  if [[ -z "$RESOLVED" ]]; then
    log "WARNING: ${d} does not resolve. Add the A record before continuing."
    exit 1
  fi
  if [[ "$RESOLVED" != "$VM_IP" ]]; then
    log "WARNING: ${d} resolves to ${RESOLVED}, not this VM (${VM_IP})."
    log "Wait for DNS propagation (TTL) or fix the record. Aborting."
    exit 1
  fi
done

# ── 3. Issue / renew certs via nginx plugin ───────────────────────────────────
log "Issuing certificates for ${DOMAINS[*]}..."
certbot --nginx --non-interactive --agree-tos \
  --expand \
  --email "$EMAIL" \
  --redirect \
  -d "${DOMAINS[0]}" -d "${DOMAINS[1]}" -d "${DOMAINS[2]}"

# ── 4. Auto-renewal cron ──────────────────────────────────────────────────────
# certbot ships a systemd timer by default on Ubuntu 22.04; this is a
# belt-and-suspenders cron in case the timer is missing.
if ! systemctl is-enabled certbot.timer &>/dev/null; then
  log "Adding cron renewal..."
  cat > /etc/cron.d/certbot-nomos <<'CRON'
0 3 * * * root certbot renew --quiet --post-hook "systemctl reload nginx"
CRON
fi

log "Done. nginx is now serving HTTPS for: ${DOMAINS[*]}"
systemctl reload nginx
