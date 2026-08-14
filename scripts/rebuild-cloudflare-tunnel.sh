#!/usr/bin/env bash
# Deep rebuild: wipe glitched tunnel service + fresh install with new token.
#
# BEFORE running with a brand-new tunnel:
#   1. Cloudflare Zero Trust → Networks → Tunnels → Delete old tunnel
#   2. Create a new tunnel → copy the new --token value
#   3. Public Hostname tab → add erp.kutalimzhda.com → http://localhost:3000
#   4. Put the new token in .env as CLOUDFLARE_TUNNEL_TOKEN (or pass as env var)
#
# Usage:
#   bash scripts/rebuild-cloudflare-tunnel.sh
#   NEW_CLOUDFLARE_TUNNEL_TOKEN='eyJ...' bash scripts/rebuild-cloudflare-tunnel.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="$ROOT/.env"

decode_tunnel_id_from_token() {
  python3 - <<'PY' "$1"
import base64, json, sys
token = sys.argv[1]
payload = token.split(".")[0]
payload += "=" * (-len(payload) % 4)
data = json.loads(base64.urlsafe_b64decode(payload))
print(data.get("t", ""))
PY
}

update_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=\"${value}\"|" "$ENV_FILE"
  else
    printf '%s="%s"\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

echo "==> Step 1: Network diagnostics"
bash "$ROOT/scripts/diagnose-tunnel-network.sh" || echo "WARN: Some network checks failed (7844/443 may be blocked)"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +a
fi

NEW_TOKEN="${NEW_CLOUDFLARE_TUNNEL_TOKEN:-${CLOUDFLARE_TUNNEL_TOKEN:-}}"
if [[ -z "$NEW_TOKEN" ]]; then
  echo "ERROR: No tunnel token."
  echo "Create a new tunnel in Cloudflare Zero Trust, copy the token, then either:"
  echo "  - Set CLOUDFLARE_TUNNEL_TOKEN in .env"
  echo "  - Run: NEW_CLOUDFLARE_TUNNEL_TOKEN='eyJ...' bash scripts/rebuild-cloudflare-tunnel.sh"
  exit 1
fi

NEW_TUNNEL_ID="$(decode_tunnel_id_from_token "$NEW_TOKEN" || true)"
if [[ -n "$NEW_TUNNEL_ID" ]]; then
  echo "==> Tunnel ID from token: $NEW_TUNNEL_ID"
  update_env_var "CLOUDFLARE_TUNNEL_TOKEN" "$NEW_TOKEN"
  update_env_var "CLOUDFLARE_TUNNEL_ID" "$NEW_TUNNEL_ID"
  # shellcheck disable=SC1091
  source "$ENV_FILE"
fi

echo "==> Step 2: Remove old / glitched cloudflared service"
if command -v pm2 >/dev/null 2>&1 || command -v npx >/dev/null 2>&1; then
  pm2_cmd() { command -v pm2 >/dev/null 2>&1 && pm2 "$@" || npx pm2 "$@"; }
  for app in textile-tunnel textile-tunnel-guard textile-watchdog textile-tunnel-keepalive textile-tunnel-recovery; do
    pm2_cmd delete "$app" 2>/dev/null || true
  done
  pm2_cmd save 2>/dev/null || true
fi

sudo cloudflared service uninstall 2>/dev/null || true
sudo /etc/init.d/cloudflared stop 2>/dev/null || true
pkill -f cloudflared 2>/dev/null || true
sleep 3

# Clear stale token file
sudo rm -f /etc/cloudflared/token 2>/dev/null || true

echo "==> Step 3: Fresh install with token"
sudo cloudflared service install "$NEW_TOKEN"

TUNNEL_PROTOCOL="${CLOUDFLARE_TUNNEL_PROTOCOL:-http2}"
if [[ -f /etc/init.d/cloudflared ]]; then
  sudo sed -i "s|tunnel run --token-file|tunnel run --protocol ${TUNNEL_PROTOCOL} --token-file|" /etc/init.d/cloudflared
  sudo sed -i "s|tunnel run --protocol [a-z0-9]* --protocol|tunnel run --protocol|" /etc/init.d/cloudflared 2>/dev/null || true
  if command -v update-rc.d >/dev/null 2>&1; then
    sudo update-rc.d cloudflared defaults 2>/dev/null || true
  fi
  sudo /etc/init.d/cloudflared restart
elif command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable --now cloudflared 2>/dev/null || sudo systemctl restart cloudflared
fi

sleep 10

echo "==> Step 4: Fix DNS for ${ERP_HOSTNAME:-erp.kutalimzhda.com}"
if [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ZONE_ID:-}" && -n "${CLOUDFLARE_TUNNEL_ID:-}" ]]; then
  bash "$ROOT/scripts/setup-custom-domain.sh" || echo "WARN: DNS update failed — set CNAME manually in Cloudflare DNS"
else
  echo "WARN: Set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID to auto-fix DNS"
  echo "      Or in tunnel dashboard: Public Hostname → erp.kutalimzhda.com → http://localhost:3000"
fi

echo "==> Step 5: Verify"
bash "$ROOT/scripts/ensure-24-7.sh" || true

PUBLIC="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
if curl -sf --max-time 15 "$PUBLIC" | grep -q '"status"'; then
  echo ""
  echo "SUCCESS: $PUBLIC is reachable"
  echo "Check Cloudflare Zero Trust → Networks → Tunnels → status HEALTHY (green)"
else
  echo ""
  echo "WARN: Public URL still not OK after rebuild."
  echo "  1. In Zero Trust → Tunnels → Public Hostname: erp.kutalimzhda.com → http://localhost:3000"
  echo "  2. Confirm new tunnel shows HEALTHY in dashboard"
  echo "  3. Run: bash scripts/diagnose-tunnel-network.sh"
  echo "  4. Logs: tail -50 /var/log/cloudflared.log"
  exit 1
fi
