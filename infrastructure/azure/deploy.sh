#!/usr/bin/env bash
# Nomos — Azure VM bootstrap + deploy
# Tested on Ubuntu 22.04 LTS (Standard_B1s / Standard_B1ms).
# Idempotent: re-run to pull latest code and restart services.
# Does NOT touch .env.local or regenerate secrets on subsequent runs.
#
# Run on VM via:
#   az vm run-command invoke -g nomos-rg -n nomos-vm \
#     --command-id RunShellScript --scripts @infrastructure/azure/deploy.sh

set -euo pipefail

REPO_URL="https://github.com/varendra007/agent-credential-broker.git"
APP_DIR="/opt/nomos/app"
ENV_FILE="$APP_DIR/.env.local"
SERVICE_USER="nomos"
NODE_MAJOR="22"
PNPM_VERSION="11.0.8"

log() { echo "[$(date '+%H:%M:%S')] nomos-deploy: $*"; }

# ── 1. System packages ────────────────────────────────────────────────────────
log "System packages..."
apt-get update -y -q 2>&1 | tail -3
DEBIAN_FRONTEND=noninteractive apt-get install -y -q git curl nginx openssl 2>&1 | tail -3

# ── 2. Swap (2 GB) ────────────────────────────────────────────────────────────
if ! swapon --show | grep -q /swapfile 2>/dev/null; then
  log "Creating 2 GB swap..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -qxF '/swapfile none swap sw 0 0' /etc/fstab || \
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ── 3. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# ── 4. Node.js ────────────────────────────────────────────────────────────────
if ! node -v 2>/dev/null | grep -q "^v${NODE_MAJOR}\."; then
  log "Installing Node.js ${NODE_MAJOR}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - 2>&1 | tail -3
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q nodejs 2>&1 | tail -3
fi
log "Node: $(node -v)"

# ── 5. pnpm ───────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  log "Installing pnpm ${PNPM_VERSION}..."
  corepack enable
  corepack prepare "pnpm@${PNPM_VERSION}" --activate
fi
log "pnpm: $(pnpm -v)"

# ── 6. Service user ───────────────────────────────────────────────────────────
id -u "$SERVICE_USER" &>/dev/null || useradd -r -s /bin/bash -m "$SERVICE_USER"

# ── 7. Clone / update repo ────────────────────────────────────────────────────
mkdir -p /opt/nomos
if [[ -d "$APP_DIR/.git" ]]; then
  log "Pulling latest code..."
  git -C "$APP_DIR" fetch --tags
  git -C "$APP_DIR" pull --ff-only
else
  log "Cloning repo..."
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" /opt/nomos

# ── 8. Generate secrets (first run only) ─────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  log "Generating secrets (first run)..."

  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  OAUTH_ENC_KEY=$(openssl rand -hex 32)
  OAUTH_STATE_SECRET=$(openssl rand -hex 32)
  BETTER_AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n=+/')
  SERVICE_TOKEN=$(openssl rand -hex 24)

  # Best-effort: read public IP from Azure IMDS
  VM_IP=$(curl -sf -H "Metadata: true" \
    "http://169.254.169.254/metadata/instance/network/interface/0/ipv4/ipAddress/0/publicIpAddress?api-version=2021-02-01&format=text" \
    2>/dev/null || echo "0.0.0.0")

  cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=production
LOG_LEVEL=info

# ── Database ──────────────────────────────────────────────────────────────────
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgres://cb:${POSTGRES_PASSWORD}@127.0.0.1:5432/cb_prod
DATABASE_DIRECT_URL=postgres://cb:${POSTGRES_PASSWORD}@127.0.0.1:5432/cb_prod

# ── Auth + crypto ─────────────────────────────────────────────────────────────
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
OAUTH_TOKEN_ENCRYPTION_KEY=${OAUTH_ENC_KEY}
OAUTH_STATE_SIGN_SECRET=${OAUTH_STATE_SECRET}
CONTROL_PLANE_SERVICE_TOKEN=${SERVICE_TOKEN}

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://127.0.0.1:6379

# ── Public URLs (update after DNS mapping) ───────────────────────────────────
CONTROL_PLANE_PUBLIC_URL=http://${VM_IP}
DASHBOARD_PUBLIC_URL=https://app.auto-nomos.com
PDP_PUBLIC_URL=http://${VM_IP}:8787
NEXT_PUBLIC_CONTROL_PLANE_URL=http://${VM_IP}
NEXT_PUBLIC_PDP_URL=http://${VM_IP}:8787

# ── Step-up ───────────────────────────────────────────────────────────────────
KNOCK_API_KEY=
KNOCK_WORKFLOW_ID=step-up-request
STEPUP_DEFAULT_TTL_MS=60000
PDP_WEBHOOK_URLS=http://127.0.0.1:8787/v1/internal/refresh-revocations

# ── Signing keys (populated below by pnpm gen-keys) ──────────────────────────
CONTROL_PLANE_BUNDLE_SIGN_KEY=
CONTROL_PLANE_BUNDLE_VERIFY_KEY=
CONTROL_PLANE_BUNDLE_SIGN_DID=
AUDIT_SIGN_KEY=
AUDIT_VERIFY_KEY=
AUDIT_SIGNING_KEY_ID=

# ── Telegram (add after BotFather setup) ─────────────────────────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=

# ── OAuth connectors (add as needed) ─────────────────────────────────────────
OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
OAUTH_SLACK_CLIENT_ID=
OAUTH_SLACK_CLIENT_SECRET=
OAUTH_NOTION_CLIENT_ID=
OAUTH_NOTION_CLIENT_SECRET=
OAUTH_LINEAR_CLIENT_ID=
OAUTH_LINEAR_CLIENT_SECRET=

# ── Intent coherence ─────────────────────────────────────────────────────────
INTENT_COHERENCE_ENABLED=false
ANTHROPIC_API_KEY=

# ── R2 audit archive (disabled) ──────────────────────────────────────────────
R2_AUDIT_ENDPOINT=
R2_AUDIT_BUCKET=
R2_AUDIT_ACCESS_KEY_ID=
R2_AUDIT_SECRET_ACCESS_KEY=
ENVEOF

  chmod 600 "$ENV_FILE"
  log ".env.local created (secrets generated)"
fi

# Source env for rest of script
set -a; source "$ENV_FILE"; set +a

# ── 9. Start infra (postgres + redis) ────────────────────────────────────────
log "Starting postgres + redis..."
cd "$APP_DIR"
docker compose -f infrastructure/azure/docker-compose.infra.yml up -d --wait
log "Infra healthy."

# ── 10. Install deps ──────────────────────────────────────────────────────────
log "Installing dependencies (this may take a few minutes)..."
pnpm install --frozen-lockfile

# ── 11. Build ─────────────────────────────────────────────────────────────────
log "Building all packages..."
NODE_OPTIONS="--max-old-space-size=768" pnpm build

# ── 12. Generate signing keys (first run only) ────────────────────────────────
if ! grep -q "^CONTROL_PLANE_BUNDLE_SIGN_KEY=[a-f0-9]" "$ENV_FILE" 2>/dev/null; then
  log "Generating Ed25519 signing keys..."
  pnpm gen-keys   # writes to APP_DIR/.env.local (since CWD = APP_DIR)
  set -a; source "$ENV_FILE"; set +a
  log "Signing keys written to .env.local"
fi

# ── 13. DB migrations ─────────────────────────────────────────────────────────
log "Running DB migrations..."
pnpm --filter @auto-nomos/control-plane db:migrate
log "Migrations done."

# ── 14. Systemd services ──────────────────────────────────────────────────────
log "Installing systemd services..."

NODE_BIN=$(which node)

cat > /etc/systemd/system/nomos-control-plane.service <<UNIT
[Unit]
Description=Nomos Control Plane
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=PORT=8788
ExecStart=${NODE_BIN} apps/control-plane/dist/index.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nomos-cp

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/nomos-pdp.service <<UNIT
[Unit]
Description=Nomos PDP
After=network.target nomos-control-plane.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=PORT=8787
ExecStart=${NODE_BIN} apps/pdp/dist/index.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nomos-pdp

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable nomos-control-plane nomos-pdp
systemctl restart nomos-control-plane nomos-pdp
log "Services started."

# ── 15. Nginx ─────────────────────────────────────────────────────────────────
log "Configuring nginx..."
cp "$APP_DIR/infrastructure/azure/nginx.conf" /etc/nginx/sites-available/nomos
ln -sf /etc/nginx/sites-available/nomos /etc/nginx/sites-enabled/nomos
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

# ── Done ──────────────────────────────────────────────────────────────────────
VM_IP=$(curl -sf -H "Metadata: true" \
  "http://169.254.169.254/metadata/instance/network/interface/0/ipv4/ipAddress/0/publicIpAddress?api-version=2021-02-01&format=text" \
  2>/dev/null || hostname -I | awk '{print $1}')

log ""
log "=========================================="
log "  Nomos deployed successfully"
log "=========================================="
log "  Control plane:  http://${VM_IP}/health"
log "  PDP:            http://${VM_IP}:8787/health"
log "  Env file:       ${ENV_FILE}"
log "  Logs (cp):      journalctl -u nomos-control-plane -f"
log "  Logs (pdp):     journalctl -u nomos-pdp -f"
log ""
log "  Next steps:"
log "  1. Map DNS: api.auto-nomos.com A → ${VM_IP}"
log "  2. Map DNS: pdp.auto-nomos.com A → ${VM_IP}"
log "  3. After DNS propagates: certbot --nginx -d api.auto-nomos.com -d pdp.auto-nomos.com"
log "  4. Update CONTROL_PLANE_PUBLIC_URL in ${ENV_FILE} to https://api.auto-nomos.com"
log "  5. Telegram: set TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME in ${ENV_FILE}"
log "     then: systemctl restart nomos-control-plane"
log "  6. Deploy dashboard to Vercel with NEXT_PUBLIC_CONTROL_PLANE_URL=https://api.auto-nomos.com"
log "=========================================="
