# Textile ERP — Complete Feature List

This file is the **canonical checklist** of features on the `main` branch.
Deploy and develop from `main` so nothing is lost when starting a new session or link.

**Repository:** https://github.com/mohammedmzhdaf21-star/textile-erp  
**Default branch:** `main`  
**Latest feature tag:** `v1.2.0-full-features`

---

## Inventory & New Item

- Family code + sub-code (price) + color + branch QR labels
- **Multiple rolls** per same family code, color, and price (instance suffixes `-R02`, etc.)
- **Under 2 m rule:** rolls or piece lengths below 2 meters save as **remnants**
- Piece packages (multi-piece sets with component stock)
- Inventory search by QR/family code with **per-roll and per-length breakdown**
- Edit, archive/remove, and identity migration
- **Manual color add** (Admin/Manager): name + hex in New Item
- **Kurdish color labels** in dropdowns (Sorani translations)
- **Print QR** on any inventory row to reprint labels from saved item ID
- QR/id alignment: saved ID always matches printed QR (instance counting fix)

## QR & Scanning

- **Camera-only QR scan** (no manual code typing) on:
  - Sales (item + roll)
  - Exchange (new + returned items)
  - Inventory QR search
  - Item Conversion (transfer + roll)
  - Dashboard (minimum price item)
- Lookup by item ID or `qrCodeValue`, case-insensitive
- Scanned code shown read-only after scan; lookup runs automatically

## Sales

- Roll/remnant sold by meter; pieces by count
- Piece packages (full/partial)
- Plain cloth lines
- **Cut from roll & sell:** cut piece, record sale, print QR label (for exchange)
- QR snapshot saved on sale items (daily/history sales + sale detail)

## Exchange

- Return + replacement workflow
- Camera scan for returned and new items

## Item Conversion

- Branch transfer with new destination QR
- Roll/remnant → piece cut (no immediate sale here)
- Auto-complete cutting tasks on roll-to-piece

## History Sales

- Search by **customer phone** or **item QR code**
- QR saved badge on sales with stored label image

## Cutting Tasks

- Auto-create when shelf pieces hit 0 but roll stock remains
- Task Employee page with sidebar badge

## Owed Money

- Full vs partial payment recording

## i18n

- English + Kurdish Sorani (RTL)
- Language switcher on login and sidebar

## UI

- **Collapsible sidebar** — floating Menu/Hide toggle (top-left) with luxury slide animation; preference saved in localStorage
- Full-width workspace when sidebar is hidden

## Employee Accounts (Admin)

- Sidebar section: **Employee Accounts**
- Create login accounts (name, email, password, role, branches)
- Choose **sidebar access** per employee (which pages they see)
- Access rules saved in database (`allowedSections` on Employee)
- Admins/managers always have full access

## Branches

- A, B, C, E, F + Storage (S)

---

## Database migrations (run on deploy)

```bash
npx prisma migrate deploy
npx prisma generate
```

Required migration for sale QR fields: `20260710120000_add_sale_item_qr_fields`

---

## After pulling `main`

```bash
npm install
cd frontend && npm install
npx prisma migrate deploy
npx prisma generate
npm run seed          # optional, fresh DB only
npm run dev           # backend :3000
cd frontend && npm run dev   # frontend :5173
```

**Login:** `admin@textile.com` / `admin123`

---

## If features are missing in the UI

This usually means the workspace is on an **old branch**, not `main`.

```bash
git fetch origin main
git checkout main
git pull origin main
./scripts/setup-dev.sh
npm run dev
cd frontend && npm run dev
```

Confirm these files exist (if any are missing, you are not on `main`):

- `frontend/src/components/QrScanInput.tsx`
- `frontend/src/components/LanguageSwitcher.tsx`
- `frontend/src/lib/cutAndSell.ts`
- `frontend/src/lib/cuttingTasks.ts`
- `FEATURES.md`

**Never deploy or demo from stale feature branches** — they lag behind `main` and lose QR scan, cut-sell, i18n, and other merged work.
