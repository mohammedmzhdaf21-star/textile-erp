# Cloudflare Tunnel Setup

**Type:** Dashboard-managed (token from Zero Trust, not `config.yml`)

## Quick commands

```bash
npm run diagnose:tunnel   # Check ports 443/7844 + public URL
npm run install:tunnel    # Install official system service
npm run rebuild:tunnel    # Wipe + fresh install (use after 1033)
```

## If Error 1033 persists — create a NEW tunnel

1. **Zero Trust** → Networks → Tunnels → **Delete** old tunnel
2. **Create a tunnel** → copy the new `--token ...` value
3. **Public Hostname** tab → Add:
   - Hostname: `erp.kutalimzhda.com`
   - Service: `http://localhost:3000`
4. Update `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN="<paste new token>"
   ```
5. On the server:
   ```bash
   npm run rebuild:tunnel
   ```

## Network requirements (outbound)

| Port | Purpose |
|------|---------|
| **443** | HTTPS to Cloudflare |
| **7844** | Tunnel protocol |

Run `npm run diagnose:tunnel` to verify.

## Architecture

| Component | Manager |
|-----------|---------|
| ERP app (port 3000) | PM2 `textile-erp` |
| Cloudflare tunnel | System service `cloudflared` |

**Do not** run a second tunnel via PM2 — duplicate connectors cause 1033.

## Verify

- Dashboard: Zero Trust → Tunnels → **HEALTHY** (green)
- Terminal: `curl https://erp.kutalimzhda.com/health`
