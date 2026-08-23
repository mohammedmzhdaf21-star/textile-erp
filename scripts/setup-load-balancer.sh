#!/usr/bin/env bash
# Create a Cloudflare public load balancer for the ERP tunnel (erp.kutalimzhda.com).
#
# Requires in .env:
#   CLOUDFLARE_LB_API_TOKEN  (or CLOUDFLARE_API_TOKEN) with Load Balancing edit
#   CLOUDFLARE_ACCOUNT_ID
#   CLOUDFLARE_ZONE_ID
#   CLOUDFLARE_TUNNEL_ID
#   ERP_HOSTNAME (default erp.kutalimzhda.com)
#
# Create token: https://dash.cloudflare.com/profile/api-tokens
#   Permissions: Account → Load Balancing: Monitors and Pools Write
#                Zone → Load Balancers Write, DNS Write (for kutalimzhda.com)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

TOKEN="${CLOUDFLARE_LB_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-}"
ZONE="${CLOUDFLARE_ZONE_ID:-}"
TUNNEL="${CLOUDFLARE_TUNNEL_ID:-78344c43-882b-4652-b08f-ac57c98d0abb}"
HOST="${ERP_HOSTNAME:-erp.kutalimzhda.com}"
POOL_NAME="${LB_POOL_NAME:-textile-erp-tunnel}"
MONITOR_DESC="${LB_MONITOR_DESC:-Textile ERP tunnel health}"
LB_DESC="${LB_DESCRIPTION:-Textile ERP public load balancer}"
TUNNEL_ENDPOINT="${TUNNEL}.cfargotunnel.com"
LOG_FILE="$ROOT/deploy/load-balancer-setup.log"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG_FILE"
}

if [[ -z "$TOKEN" || -z "$ACCOUNT" || -z "$ZONE" ]]; then
  echo "Missing Cloudflare credentials."
  echo "Add to .env:"
  echo "  CLOUDFLARE_LB_API_TOKEN=...   # Load Balancing + Zone LB Write"
  echo "  CLOUDFLARE_ACCOUNT_ID=..."
  echo "  CLOUDFLARE_ZONE_ID=..."
  exit 1
fi

verify_token() {
  local status
  status="$(curl -s "https://api.cloudflare.com/client/v4/user/tokens/verify" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin).get('result',{}).get('status',''))")"
  if [[ "$status" != "active" ]]; then
    log "ERROR: API token verification failed (status=$status)"
    exit 1
  fi
}

cf_get() {
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

log "==> Verifying API token"
verify_token

log "==> Ensuring HTTPS monitor for $HOST (/health)"
export TOKEN ACCOUNT HOST MONITOR_DESC POOL_NAME TUNNEL_ENDPOINT POOL_ID LB_DESC ZONE
MONITOR_ID="$(python3 - <<'PY'
import json, os, urllib.request

token = os.environ["TOKEN"]
account = os.environ["ACCOUNT"]
host = os.environ["HOST"]
desc = os.environ["MONITOR_DESC"]

def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)

monitors = api("GET", f"/accounts/{account}/load_balancers/monitors").get("result", [])
for monitor in monitors:
    if monitor.get("description") == desc:
        print(monitor["id"])
        raise SystemExit(0)
    header = (monitor.get("header") or {}).get("Host") or []
    if monitor.get("path") == "/health" and host in header:
        print(monitor["id"])
        raise SystemExit(0)

created = api("POST", f"/accounts/{account}/load_balancers/monitors", {
    "type": "https",
    "method": "GET",
    "path": "/health",
    "port": 443,
    "expected_codes": "200",
    "description": desc,
    "interval": 60,
    "timeout": 5,
    "retries": 2,
    "follow_redirects": True,
    "header": {"Host": [host]},
})
print(created["result"]["id"])
PY
)"

log "Monitor ID: $MONITOR_ID"

export MONITOR_ID
log "==> Ensuring pool $POOL_NAME -> $TUNNEL_ENDPOINT (Host: $HOST)"
POOL_ID="$(python3 - <<'PY'
import json, os, urllib.request

token = os.environ["TOKEN"]
account = os.environ["ACCOUNT"]
pool_name = os.environ["POOL_NAME"]
monitor_id = os.environ["MONITOR_ID"]
endpoint = os.environ["TUNNEL_ENDPOINT"]
host = os.environ["HOST"]

def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)

pools = api("GET", f"/accounts/{account}/load_balancers/pools").get("result", [])
for pool in pools:
    if pool.get("name") == pool_name:
        print(pool["id"])
        raise SystemExit(0)

payload = {
    "name": pool_name,
    "description": "Textile ERP primary tunnel pool",
    "enabled": True,
    "monitor": monitor_id,
    "minimum_origins": 1,
    "check_regions": ["WNAM", "ENAM", "WEUR", "EEUR"],
    "origins": [
        {
            "name": "textile-erp-primary",
            "address": endpoint,
            "enabled": True,
            "weight": 1,
            "header": {"Host": [host]},
        }
    ],
}
created = api("POST", f"/accounts/{account}/load_balancers/pools", payload)
print(created["result"]["id"])
PY
)"

log "Pool ID: $POOL_ID"

export POOL_ID
log "==> Ensuring load balancer $HOST"
LB_ID="$(python3 - <<'PY'
import json, os, urllib.request

token = os.environ["TOKEN"]
zone = os.environ["ZONE"]
host = os.environ["HOST"]
pool_id = os.environ["POOL_ID"]
desc = os.environ["LB_DESC"]

def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)

lbs = api("GET", f"/zones/{zone}/load_balancers").get("result", [])
for lb in lbs:
    if lb.get("name") == host:
        print(lb["id"])
        raise SystemExit(0)

payload = {
    "name": host,
    "description": desc,
    "enabled": True,
    "ttl": 30,
    "proxied": True,
    "steering_policy": "off",
    "session_affinity": "none",
    "fallback_pool": pool_id,
    "default_pools": [pool_id],
}
created = api("POST", f"/zones/{zone}/load_balancers", payload)
print(created["result"]["id"])
PY
)"

log "Load balancer ID: $LB_ID"

log "==> Waiting for DNS + health propagation"
sleep 15

PUBLIC="${ERP_PUBLIC_URL:-https://$HOST}/health"
for attempt in $(seq 1 12); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$PUBLIC" || echo 000)"
  if [[ "$code" == "200" ]] && curl -sf --max-time 12 "$PUBLIC" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    log "SUCCESS: $PUBLIC returns 200"
    echo ""
    echo "Load balancer ready: https://$HOST"
    echo "  Monitor: $MONITOR_ID"
    echo "  Pool:    $POOL_ID"
    echo "  LB:      $LB_ID"
    exit 0
  fi
  log "Attempt $attempt: public health HTTP $code — retrying..."
  sleep 10
done

log "WARN: Load balancer created but public health not confirmed yet"
echo "Created LB $LB_ID — check Cloudflare dashboard → Load Balancing"
exit 0
