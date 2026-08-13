#!/usr/bin/env bash
# Boot persistence only: PM2 starts app + tunnel after server reboot. No health polling.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_DIR="$ROOT/deploy"
mkdir -p "$DEPLOY_DIR"

echo "==> Boot persistence (app + Cloudflare named tunnel)"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"
tunnel_apply_quic_sysctl

SYSCTL_FILE="$ROOT/deploy/sysctl/99-cloudflared-quic.conf"
if [[ -f "$SYSCTL_FILE" ]] && command -v sysctl >/dev/null 2>&1; then
  sysctl -p "$SYSCTL_FILE" 2>/dev/null || true
  if [[ -w /etc/sysctl.d ]]; then
    cp "$SYSCTL_FILE" /etc/sysctl.d/99-cloudflared-quic.conf 2>/dev/null || true
    echo "==> Installed /etc/sysctl.d/99-cloudflared-quic.conf"
  fi
fi

install_reboot_cron() {
  local cron_file="/etc/cron.d/textile-erp"
  if [[ -w /etc/cron.d ]]; then
    cat > "$cron_file" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/exec-daemon:/exec-daemon/node_modules/.bin
@reboot ubuntu bash $ROOT/scripts/pm2-boot.sh
EOF
    echo "==> Installed $cron_file (@reboot only — no health polling)"
    return 0
  fi
  if command -v crontab >/dev/null 2>&1; then
    (crontab -l 2>/dev/null | grep -v "pm2-boot.sh" | grep -v "ensure-tunnel-healthy" | grep -v "ensure-24-7.sh" || true
     echo "@reboot bash $ROOT/scripts/pm2-boot.sh") | crontab -
    echo "==> Installed user crontab (@reboot only)"
    return 0
  fi
  echo "WARN: No cron available — rely on pm2 systemd startup after reboot."
  return 1
}

install_reboot_cron || true

if command -v pm2 >/dev/null 2>&1; then
  pm2 save 2>/dev/null || true
  pm2 startup systemd -u "$(id -un)" --hp "$HOME" 2>/dev/null | tee "$DEPLOY_DIR/pm2-startup.cmd" || true
elif command -v npx >/dev/null 2>&1; then
  npx pm2 save 2>/dev/null || true
fi

echo "==> Boot persistence complete"
echo "    Permanent URL: ${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}"
echo "    Stack: textile-erp + textile-tunnel (Cloudflare named tunnel)"
