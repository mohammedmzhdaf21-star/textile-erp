#!/usr/bin/env bash
# Restart the official cloudflared system service.
set -euo pipefail

if [[ -x /etc/init.d/cloudflared ]]; then
  sudo /etc/init.d/cloudflared restart
elif command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service 2>/dev/null | grep -q cloudflared; then
  sudo systemctl restart cloudflared
else
  exit 1
fi
