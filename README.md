# Textile ERP

Full-stack inventory and sales system for textile branches (rolls, pieces, remnants, packages).

**Repository:** https://github.com/mohammedmzhdaf21-star/textile-erp  
**Always use branch `main`** for deployments and new work so features are not lost.

**Full feature checklist:** see [FEATURES.md](./FEATURES.md)

## Login (seed)

- Email: `admin@textile.com`
- Password: `admin123`

## Quick start

```bash
git clone https://github.com/mohammedmzhdaf21-star/textile-erp.git
cd textile-erp
git checkout main
git pull origin main
./scripts/setup-dev.sh
SEED_DB=1 ./scripts/setup-dev.sh   # optional — fresh database only
npm run dev                        # backend :3000
cd frontend && npm run dev         # frontend :5173
```

If the UI is missing camera scan, cut-from-roll sell, Kurdish labels, or other features, you are on the wrong branch. Run `git checkout main && git pull` then `./scripts/setup-dev.sh` again. See [FEATURES.md](./FEATURES.md#if-features-are-missing-in-the-ui).

## Highlights (saved on `main`)

| Area | Features |
|------|----------|
| **Scanning** | Camera-only QR scan in Sales, Exchange, Inventory, Conversion, Dashboard |
| **Sales** | Cut from roll & sell + print QR; QR saved on sale records |
| **New Item** | Manual color add (Admin); Kurdish color names |
| **Inventory** | Stock breakdown, Print QR, multiple rolls per family |
| **History** | Search sales by phone or item QR code |
| **i18n** | English + Kurdish Sorani |

See [FEATURES.md](./FEATURES.md) for the complete list.

Alternative hosting (Render): see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Release tags

| Tag | Contents |
|-----|----------|
| `v1.0.0-full-features` | Initial full feature set |
| `v1.1.0-full-features` | Multiple rolls, stock breakdown, under-2m remnant rule |
| `v1.2.0-full-features` | QR camera scan, cut-sell, manual colors, print QR, history search, sale QR snapshots |
| `v1.2.1-full-features` | Commission payouts, employee access, IQD thousands |
| `v1.3.0-full-features` | Plain cloth pricing, device sign-in, employee registration, nav dropdowns, line pricing, deploy script, conversion links |

## Development

```bash
npm run dev          # backend (runs prisma generate first)
cd frontend && npm run dev
```

After any schema change: `npx prisma migrate deploy && npx prisma generate` then restart the backend.

## Run 24/7 (production)

For always-on operation with auto-restart on crash, tunnel recovery, and after reboot:

```bash
git checkout main
git pull origin main
```

Add to `.env` (one-time):

```env
CLOUDFLARE_TUNNEL_TOKEN=your-named-tunnel-token
ERP_PUBLIC_URL=https://erp.kutalimzhda.com
CLOUDFLARE_API_TOKEN=...      # optional — auto-fix DNS
CLOUDFLARE_ZONE_ID=...        # optional — auto-fix DNS
```

Then:

```bash
npm run install:24-7
```

This will:

- Build the frontend and serve it from the backend on port **3000**
- Start the **named Cloudflare tunnel** for `https://erp.kutalimzhda.com` (stable URL)
- Run a **health watchdog** + **keepalive pinger** + **cron recovery** so Cloudflare **1033** auto-fixes within seconds (see below)
- Install **PM2** (or systemd) so processes restart automatically after reboot

**Do not use** `trycloudflare.com` backup URLs in production — they expire when the tunnel restarts and cause **530** errors.

### Permanent fix for Cloudflare Error 1033

Production runs **four layers** so the tunnel never stays down:

| Layer | What it does |
|-------|----------------|
| **QUIC tunnel** | 4 HA connections to Cloudflare edge (not a single HTTP/2 link) |
| **Keepalive** | Pings public URL every 30s so connections never idle-timeout |
| **Watchdog (PM2)** | Every 10s: if public fails or HA connections drop below 2 → restart tunnel |
| **Cron backup** | Every 2 min: same recovery even if PM2 watchdog stops |
| **Scheduled refresh** | Tunnel restarts every 2 hours before stale sessions drop |

If you ever see 1033, wait 10–30 seconds — it should recover automatically. Manual fix: `npx pm2 restart textile-tunnel`.

**Useful commands**

```bash
npx pm2 status                             # app + tunnel + watchdog
npx pm2 logs textile-erp                   # app logs
npx pm2 logs textile-tunnel                # named tunnel logs
tail -f deploy/watchdog.log                # auto-recovery log
npx pm2 restart all                        # restart after code updates
curl https://erp.kutalimzhda.com/health    # public health check
curl http://localhost:3000/health          # local health check
```

On systems with a user systemd session, the installer uses systemd instead of PM2.

**After pulling new code**

```bash
git pull origin main
npm run install:24-7
```

**Stop 24/7 mode**

```bash
npx pm2 delete all
# or, if using systemd:
systemctl --user disable --now textile-erp textile-tunnel textile-watchdog
```
