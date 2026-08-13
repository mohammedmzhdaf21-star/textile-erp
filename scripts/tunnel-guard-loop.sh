#!/usr/bin/env bash
# Safety net: keeps https://erp.kutalimzhda.com reachable 24/7.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INTERVAL="${TUNNEL_GUARD_INTERVAL_SEC:-10}"

mkdir -p "$ROOT/deploy"
printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "Tunnel guard started (every ${INTERVAL}s)" >>"$ROOT/deploy/tunnel-guard.log"

while true; do
  bash "$ROOT/scripts/ensure-tunnel-up.sh" || true
  sleep "$INTERVAL"
done
