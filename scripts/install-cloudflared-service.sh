#!/usr/bin/env bash
# Install Cloudflare tunnel the official way (Dashboard-managed token).
# Linux: cloudflared system service (systemd or SysV) — runs on boot, auto-restarts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
TUNNEL_PROTOCOL="${CLOUDFLARE_TUNNEL_PROTOCOL:-http2}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: Set CLOUDFLARE_TUNNEL_TOKEN in .env"
  echo "Get it from: Cloudflare Zero Trust → Networks → Tunnels → your tunnel → Install connector"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ERROR: cloudflared is not installed"
  exit 1
fi

echo "==> Tunnel type: Dashboard-managed (token)"
echo "==> Installing official cloudflared system service"

# Stop duplicate PM2 tunnel processes (two connectors cause Error 1033).
if command -v pm2 >/dev/null 2>&1 || command -v npx >/dev/null 2>&1; then
  pm2_cmd() { command -v pm2 >/dev/null 2>&1 && pm2 "$@" || npx pm2 "$@"; }
  pm2_cmd stop textile-tunnel textile-tunnel-guard 2>/dev/null || true
  pm2_cmd delete textile-tunnel textile-tunnel-guard 2>/dev/null || true
  pm2_cmd save 2>/dev/null || true
fi
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 2

sudo cloudflared service install "$TOKEN"

# Prefer HTTP/2 on this host (QUIC idle drops caused 1033).
if [[ -f /etc/init.d/cloudflared ]]; then
  sudo sed -i "s|tunnel run --token-file|tunnel run --protocol ${TUNNEL_PROTOCOL} --token-file|" /etc/init.d/cloudflared
  if command -v update-rc.d >/dev/null 2>&1; then
    sudo update-rc.d cloudflared defaults 2>/dev/null || true
  fi
  sudo /etc/init.d/cloudflared restart
elif command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable cloudflared 2>/dev/null || true
  sudo systemctl restart cloudflared 2>/dev/null || true
fi

echo ""
echo "==> Cloudflare tunnel service installed"
echo "    Domain:  ${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}"
echo "    Token:   /etc/cloudflared/token"
echo "    Logs:    /var/log/cloudflared.log"
echo ""
echo "Verify in Cloudflare Zero Trust → Networks → Tunnels (status should be HEALTHY)"
echo "Verify URL:  curl ${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
