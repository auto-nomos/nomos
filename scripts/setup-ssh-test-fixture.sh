#!/usr/bin/env bash
# Bootstrap fixture for scripts/local-ssh-mutate.mts.
#   - generates an ed25519 keypair (idempotent — reuses if present)
#   - creates ./infrastructure/docker/ssh-sandbox/{writable,readonly}
#   - writes a base64 SSH_PRIVATE_KEY + SSH_TEST_HOST_KEY block to .env.local
#
# Re-runnable. Safe to invoke before every test run.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEYS_DIR="$REPO_ROOT/infrastructure/docker/ssh-keys"
SANDBOX_DIR="$REPO_ROOT/infrastructure/docker/ssh-sandbox"
ENV_FILE="$REPO_ROOT/.env.local"

mkdir -p "$KEYS_DIR" "$SANDBOX_DIR/writable" "$SANDBOX_DIR/readonly"

if [[ ! -f "$KEYS_DIR/nomos" ]]; then
  echo "generating new ed25519 keypair at $KEYS_DIR/nomos"
  ssh-keygen -t ed25519 -f "$KEYS_DIR/nomos" -N "" -C "nomos-ssh-test" >/dev/null
else
  echo "reusing existing keypair at $KEYS_DIR/nomos"
fi

if command -v base64 >/dev/null 2>&1; then
  if [[ "$(uname)" == "Darwin" ]]; then
    PRIV_B64=$(base64 < "$KEYS_DIR/nomos")
  else
    PRIV_B64=$(base64 -w0 < "$KEYS_DIR/nomos")
  fi
else
  echo "base64 missing" >&2
  exit 1
fi

touch "$ENV_FILE"

# Strip prior block (between the two markers) so re-runs don't duplicate.
TMP=$(mktemp)
awk '/^# >>> ssh-test-fixture$/{skip=1} /^# <<< ssh-test-fixture$/{skip=0; next} !skip' "$ENV_FILE" > "$TMP"
mv "$TMP" "$ENV_FILE"

cat >> "$ENV_FILE" <<EOF
# >>> ssh-test-fixture
SSH_PRIVATE_KEY=$PRIV_B64
SSH_TEST_HOST=127.0.0.1
SSH_TEST_PORT=2222
SSH_TEST_USER=nomos
SSH_TEST_SANDBOX=/sandbox/writable
# <<< ssh-test-fixture
EOF

# Make readonly/ files unwritable from the sandbox path so traversal
# tests have something concrete to bump into.
echo "readonly-${RANDOM}" > "$SANDBOX_DIR/readonly/secret.txt"

echo "fixture ready:"
echo "  key:       $KEYS_DIR/nomos"
echo "  sandbox:   $SANDBOX_DIR"
echo "  env block: $ENV_FILE  (SSH_TEST_* + SSH_PRIVATE_KEY)"
echo
echo "next: pnpm test:local:ssh:up"
