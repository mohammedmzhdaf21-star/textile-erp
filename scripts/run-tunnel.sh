#!/usr/bin/env bash
# DEPRECATED: Ephemeral quick tunnel — causes 530 when URL expires.
# Production uses scripts/run-named-tunnel.sh via npm run install:24-7
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$ROOT/deploy"
URL_FILE="$DEPLOY_DIR/public-url.txt"
LOG_FILE="$DEPLOY_DIR/tunnel.log"
PORT="${PORT:-3000}"

mkdir -p "$DEPLOY_DIR"

echo "==> Waiting for app on http://127.0.0.1:${PORT}"
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Starting Cloudflare tunnel to http://127.0.0.1:${PORT}"
echo "    Public URL will be saved to: $URL_FILE"

/usr/local/bin/cloudflared tunnel --url "http://127.0.0.1:${PORT}" 2>&1 | tee "$LOG_FILE" | while IFS= read -r line; do
  printf '%s\n' "$line"
  url="$(printf '%s' "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 || true)"
  if [[ -n "$url" ]]; then
    printf '%s\n' "$url" > "$URL_FILE"
    printf '%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $url" >> "$DEPLOY_DIR/public-url.history"
  fi
done
