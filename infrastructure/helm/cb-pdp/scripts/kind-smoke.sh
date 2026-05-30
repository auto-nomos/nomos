#!/usr/bin/env bash
# Spins a temporary kind cluster, installs the cb-pdp chart with dummy
# secrets pointing at a mock control-plane, and asserts /healthz returns
# 200. Tears the cluster down at the end. Idempotent.
#
# Requires: kind, helm, kubectl, curl, jq (optional).
# Run from repo root:
#   bash infrastructure/helm/cb-pdp/scripts/kind-smoke.sh
set -euo pipefail

CLUSTER="cb-pdp-smoke"
NS="cb-pdp"
CHART="infrastructure/helm/cb-pdp"

need() { command -v "$1" >/dev/null || { echo "missing: $1"; exit 1; }; }
need kind
need helm
need kubectl
need curl

cleanup() {
  echo "==> teardown"
  kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> create kind cluster ($CLUSTER)"
kind get clusters | grep -qx "$CLUSTER" || kind create cluster --name "$CLUSTER" --wait 120s

echo "==> install chart (mock control-plane URL; pod will fail bundle fetch but /healthz still answers)"
helm upgrade --install pdp "$CHART" \
  --namespace "$NS" --create-namespace \
  --set image.repository=ghcr.io/auto-nomos/cb-pdp \
  --set image.tag=latest \
  --set replicaCount=1 \
  --set controlPlane.url=http://invalid.local \
  --set secret.controlPlaneServiceToken=DUMMY \
  --set secret.bundleVerifyKey=DUMMY \
  --set podDisruptionBudget.enabled=false \
  --wait --timeout 180s || true   # bundle fetch will retry; that's fine

echo "==> wait for pod ready"
kubectl -n "$NS" wait --for=condition=ready pod \
  -l app.kubernetes.io/name=cb-pdp --timeout=120s

echo "==> port-forward + /healthz check"
kubectl -n "$NS" port-forward svc/pdp 8787:8787 >/dev/null 2>&1 &
PF_PID=$!
sleep 3

if curl -sf http://localhost:8787/healthz | grep -q '"ok":true'; then
  echo "PASS: /healthz reported ok"
else
  echo "FAIL: /healthz did not return ok"
  kill $PF_PID 2>/dev/null || true
  exit 1
fi

kill $PF_PID 2>/dev/null || true
echo "==> kind-smoke OK"
