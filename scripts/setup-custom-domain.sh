#!/usr/bin/env bash
# One-command fix for erp.kutalimzhda.com via Cloudflare API.
# Add to .env:
#   CLOUDFLARE_API_TOKEN=...
#   CLOUDFLARE_ZONE_ID=...
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then set -a; source .env; set +a; fi

TOKEN="${CLOUDFLARE_DNS_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
ZONE="${CLOUDFLARE_ZONE_ID:-}"
TUNNEL="${CLOUDFLARE_TUNNEL_ID:-78344c43-882b-4652-b08f-ac57c98d0abb}"
HOST="${ERP_HOSTNAME:-erp.kutalimzhda.com}"
NAME="${HOST%%.*}"
TARGET="${TUNNEL}.cfargotunnel.com"

if [[ -z "$TOKEN" || -z "$ZONE" ]]; then
  echo "Add these to .env (one-time setup):"
  echo "  CLOUDFLARE_API_TOKEN=..."
  echo "  CLOUDFLARE_ZONE_ID=..."
  echo ""
  echo "Get token: https://dash.cloudflare.com/profile/api-tokens"
  echo "  Permissions: Zone DNS Edit"
  echo "Get zone ID: dash.cloudflare.com -> kutalimzhda.com -> right sidebar"
  exit 1
fi

cf() {
  curl -sf -G "https://api.cloudflare.com/client/v4$1" \
    -H "Authorization: Bearer $TOKEN" \
    "${@:2}"
}

cf_mut() {
  local method="$1" path="$2" data="${3:-}"
  if [[ -n "$data" ]]; then
    curl -sf -X "$method" "https://api.cloudflare.com/client/v4$path" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -sf -X "$method" "https://api.cloudflare.com/client/v4$path" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

echo "==> Removing old DNS records for $HOST"
ids="$(cf "/zones/$ZONE/dns_records" --data-urlencode "name=$HOST" | python3 -c "
import json,sys
for r in json.load(sys.stdin).get('result',[]):
    print(r['id'])
")"
for id in $ids; do
  echo "  deleting $id"
  cf_mut DELETE "/zones/$ZONE/dns_records/$id" >/dev/null
done

echo "==> Creating CNAME $HOST -> $TARGET"
cf_mut POST "/zones/$ZONE/dns_records" \
  "{\"type\":\"CNAME\",\"name\":\"$NAME\",\"content\":\"$TARGET\",\"proxied\":true}" >/dev/null

echo "==> Restarting Cloudflare tunnel service"
bash "$ROOT/scripts/restart-cloudflared-service.sh" 2>/dev/null \
  || npx pm2 restart textile-tunnel 2>/dev/null \
  || true

echo ""
echo "Done. Open in 2-5 min: https://$HOST"

