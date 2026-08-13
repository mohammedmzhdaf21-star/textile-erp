#!/usr/bin/env bash
# Boot persistence + cron safety net for 24/7 uptime.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_DIR="$ROOT/deploy"
mkdir -p "$DEPLOY_DIR"

echo "==> 24/7 boot persistence"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"
tunnel_apply_quic_sysctl

SYSCTL_FILE="$ROOT/deploy/sysctl/99-cloudflared-quic.conf"
if [[ -f "$SYSCTL_FILE" ]] && command -v sysctl >/dev/null 2>&1; then
  sysctl -p "$SYSCTL_FILE" 2>/dev/null || true
  if [[ -w /etc/sysctl.d ]]; then
    cp "$SYSCTL_FILE" /etc/sysctl.d/99-cloudflared-quic.conf 2>/dev/null || true
  fi
fi

install_cron() {
  local cron_file="/etc/cron.d/textile-erp"
  if [[ ! -w /etc/cron.d ]]; then
    return 1
  fi
  cat > "$cron_file" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/exec-daemon:/exec-daemon/node_modules/.bin
@reboot ubuntu bash $ROOT/scripts/pm2-boot.sh
* * * * * ubuntu flock -n $DEPLOY_DIR/tunnel-guard.lock bash $ROOT/scripts/ensure-tunnel-up.sh >> $DEPLOY_DIR/tunnel-guard.log 2>&1
*/5 * * * * ubuntu bash $ROOT/scripts/ensure-24-7.sh >> $DEPLOY_DIR/ensure-24-7.log 2>&1
EOF
  echo "==> Installed $cron_file"
  return 0
}

install_cron || echo "WARN: could not install system cron"

chmod +x "$ROOT/scripts/ensure-tunnel-up.sh" "$ROOT/scripts/tunnel-guard-loop.sh"

if command -v pm2 >/dev/null 2>&1; then
  pm2 save 2>/dev/null || true
elif command -v npx >/dev/null 2>&1; then
  npx pm2 save 2>/dev/null || true
fi

echo "==> Done. Stack: app + tunnel + guard (PM2 autorestart + cron backup)"
