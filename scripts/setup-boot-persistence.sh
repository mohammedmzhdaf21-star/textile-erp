#!/usr/bin/env bash
# Install boot persistence: cron @reboot + minute recovery, QUIC sysctl, pm2 save.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_DIR="$ROOT/deploy"
mkdir -p "$DEPLOY_DIR"

echo "==> Boot persistence setup"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"
tunnel_apply_quic_sysctl

SYSCTL_FILE="$ROOT/deploy/sysctl/99-cloudflared-quic.conf"
if [[ -f "$SYSCTL_FILE" ]] && command -v sysctl >/dev/null 2>&1; then
  sysctl -p "$SYSCTL_FILE" 2>/dev/null || true
  if [[ -w /etc/sysctl.d ]]; then
    cp "$SYSCTL_FILE" /etc/sysctl.d/99-cloudflared-quic.conf 2>/dev/null || true
    echo "==> Installed /etc/sysctl.d/99-cloudflared-quic.conf"
  else
    echo "WARN: Cannot write /etc/sysctl.d — QUIC buffers applied for this session only."
    echo "      Run as root: sudo cp $SYSCTL_FILE /etc/sysctl.d/ && sudo sysctl -p /etc/sysctl.d/99-cloudflared-quic.conf"
  fi
fi

CRON_REBOOT="@reboot bash $ROOT/scripts/pm2-boot.sh"
CRON_TUNNEL="* * * * * flock -n $DEPLOY_DIR/tunnel-recovery.lock bash $ROOT/scripts/ensure-tunnel-healthy.sh >> $DEPLOY_DIR/tunnel-recovery.log 2>&1"
CRON_ENSURE="*/5 * * * * bash $ROOT/scripts/ensure-24-7.sh >> $DEPLOY_DIR/ensure-24-7.log 2>&1"

install_user_crontab() {
  if ! command -v crontab >/dev/null 2>&1; then
    return 1
  fi
  (crontab -l 2>/dev/null \
    | grep -v "pm2-boot.sh" \
    | grep -v "ensure-tunnel-healthy" \
    | grep -v "ensure-24-7.sh" \
    || true
   echo "$CRON_REBOOT"
   echo "$CRON_TUNNEL"
   echo "$CRON_ENSURE") | crontab -
  echo "==> Installed user crontab: @reboot pm2-boot, */1 tunnel recovery, */5 ensure-24-7"
  return 0
}

install_system_cron() {
  local cron_file="/etc/cron.d/textile-erp"
  if [[ ! -w /etc/cron.d ]]; then
    return 1
  fi
  cat > "$cron_file" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
@reboot root bash $ROOT/scripts/pm2-boot.sh
* * * * * root flock -n $DEPLOY_DIR/tunnel-recovery.lock bash $ROOT/scripts/ensure-tunnel-healthy.sh >> $DEPLOY_DIR/tunnel-recovery.log 2>&1
*/5 * * * * root bash $ROOT/scripts/ensure-24-7.sh >> $DEPLOY_DIR/ensure-24-7.log 2>&1
EOF
  echo "==> Installed $cron_file"
  return 0
}

if install_system_cron; then
  :
elif install_user_crontab; then
  :
else
  echo "WARN: crontab not available — rely on PM2 watchdog/keepalive/recovery loop."
  echo "      After server reboot run: npm run ensure:24-7"
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 save 2>/dev/null || true
  if pm2 startup systemd -u "$(id -un)" --hp "$HOME" 2>/dev/null | tee "$DEPLOY_DIR/pm2-startup.cmd"; then
    if [[ -s "$DEPLOY_DIR/pm2-startup.cmd" ]] && grep -q "sudo" "$DEPLOY_DIR/pm2-startup.cmd"; then
      echo "==> PM2 startup command saved to deploy/pm2-startup.cmd"
      echo "    Run that sudo command once on the server for reboot persistence."
    fi
  fi
elif command -v npx >/dev/null 2>&1; then
  npx pm2 save 2>/dev/null || true
fi

echo "==> Boot persistence setup complete"
