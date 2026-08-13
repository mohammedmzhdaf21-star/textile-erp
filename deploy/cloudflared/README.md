# Cloudflare Tunnel Setup

Your tunnel is **Dashboard-managed** (recommended):

- Token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`
- DNS: CNAME `erp` → `{tunnel-id}.cfargotunnel.com`
- Configured in Cloudflare Zero Trust → Networks → Tunnels

## Install (Linux — official method)

```bash
npm run install:tunnel
```

This runs `cloudflared service install` (systemd or SysV) so the tunnel:

- Starts on server boot
- Restarts automatically if it crashes
- Uses the token from `/etc/cloudflared/token`

## Verify

1. Cloudflare Zero Trust → Networks → Tunnels → status **HEALTHY**
2. `curl https://erp.kutalimzhda.com/health` → `{"status":"ok",...}`

## App vs tunnel

| Component | Manager |
|-----------|---------|
| ERP app (port 3000) | PM2 (`textile-erp`) |
| Cloudflare tunnel | System service (`cloudflared`) |

Do **not** run a second tunnel via PM2 — duplicate connectors cause Error 1033.
