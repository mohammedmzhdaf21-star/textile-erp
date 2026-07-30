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

## Release tags

| Tag | Contents |
|-----|----------|
| `v1.0.0-full-features` | Initial full feature set |
| `v1.1.0-full-features` | Multiple rolls, stock breakdown, under-2m remnant rule |
| `v1.2.0-full-features` | QR camera scan, cut-sell, manual colors, print QR, history search, sale QR snapshots |

## Development

```bash
npm run dev          # backend (runs prisma generate first)
cd frontend && npm run dev
```

After any schema change: `npx prisma migrate deploy && npx prisma generate` then restart the backend.
