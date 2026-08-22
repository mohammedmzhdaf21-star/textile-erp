#!/usr/bin/env bash
# Step 1: Verify outbound network access for Cloudflare Tunnel.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/deploy/tunnel-network-diagnose.log"
mkdir -p "$ROOT/deploy"

log() { printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG"; }

log "=== Cloudflare tunnel network diagnostics ==="

pass=0
fail=0

check() {
  local name="$1"
  shift
  if "$@" >>"$LOG" 2>&1; then
    log "PASS: $name"
    pass=$((pass + 1))
  else
    log "FAIL: $name"
    fail=$((fail + 1))
  fi
}

check "HTTPS outbound (443 to 1.1.1.1)" curl -sf --max-time 8 https://1.1.1.1 -o /dev/null
check "HTTPS outbound (443 to api.cloudflare.com)" curl -sf --max-time 8 https://api.cloudflare.com -o /dev/null
check "TCP 7844 to region1.v2.argotunnel.com" timeout 5 bash -c 'echo >/dev/tcp/region1.v2.argotunnel.com/7844'
check "TCP 7844 to Cloudflare edge" timeout 5 bash -c 'echo >/dev/tcp/198.41.192.27/7844'
check "Local app health" curl -sf --max-time 5 http://127.0.0.1:3000/health -o /dev/null

if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env"
fi
PUBLIC="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
if curl -sf --max-time 12 "$PUBLIC" | grep -q '"status"'; then
  log "PASS: Public domain $PUBLIC"
  pass=$((pass + 1))
else
  log "FAIL: Public domain $PUBLIC (1033 or unreachable)"
  fail=$((fail + 1))
fi

if pgrep -f "cloudflared.*tunnel run" >/dev/null; then
  log "PASS: cloudflared system service running"
  pass=$((pass + 1))
else
  log "FAIL: cloudflared system service not running"
  fail=$((fail + 1))
fi

log "=== Results: $pass passed, $fail failed ==="
[[ "$fail" -eq 0 ]]
