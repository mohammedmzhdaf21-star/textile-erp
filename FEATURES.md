# Textile ERP — Complete Feature List

This file is the **canonical checklist** of features on the `main` branch.
Deploy and develop from `main` so nothing is lost when starting a new session or link.

**Repository:** https://github.com/mohammedmzhdaf21-star/textile-erp  
**Default branch:** `main`  
**Latest feature tag:** `v1.3.0-full-features`

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
- **Conversion links:** roll-to-piece and branch transfers store `sourceItemId` + `conversionType` on created items

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
- **Plain cloth lines** with managed type names and per-meter pricing
- **Total line price** for inventory and plain cloth (not forced meter × unit price)
- **Collapsible input sections** (expand/collapse title bars)
- **Cut from roll & sell:** cut piece, record sale, print QR label (for exchange)
- QR snapshot saved on sale items (daily/history sales + sale detail)
- Payment methods: **Cash**, **FIB**, and others

## Exchange

- Return + replacement workflow
- Camera scan for returned and new items

## Item Conversion

- Branch transfer with new destination QR
- Roll/remnant → piece cut (no immediate sale here)
- Restock existing sold-out pieces when converting roll → piece (match code, color, length)
- Auto-complete cutting tasks on roll-to-piece

## History Sales

- Search by **customer phone** or **item QR code**
- QR saved badge on sales with stored label image

## Cutting Tasks

- Auto-create when shelf pieces hit 0 but roll stock remains
- Task Employee page with sidebar badge
- **Tasks** nav dropdown: Task Input + Task Employee

## Owed Money

- Full vs partial payment recording
- Shows full balance vs remaining when recording payments

## Plain Cloth Pricing

- Manage plain cloth type names and per-meter prices (Admin/Manager)
- Default Kurdish names seeded: **ئەتڵەص، برنجۆک، حەریر، سلکی فەڕەنسی**
- API: `/api/plain-cloth` and `/api/commissions/plain-cloth`
- Offline browser fallback + **Reconnect** sync when server is updated
- Deploy verification via `GET /api/version` (`plainClothApi: true`)

## Commission & Pricing (sidebar dropdowns)

- **Pricing** — Item Pricing + Plain Cloth Pricing
- **Commission** — Sales Commission + Commission Payouts
- **Accounting** — Daily Sales, History Sales, Owed Money, Exchange
- **Tasks** — Task Input + Task Employee
- **Item Input** — New Item + Item Conversion

## Sales Commission & Payouts

- Commission calculated from sale price vs minimum item price
- Pending commission ledger grouped by employee
- Admin marks entries **Paid** to clear the list
- Sale detail shown on pending payout lines

## Trustee Commission

- Multi-branch trustee commission tracking and payouts

## Daily Sales & Data Analysis

- Daily sales cards with cash impact
- Data analysis dashboard page

## Employee Accounts & Access

- Sidebar section: **Employee Accounts**
- Create login accounts (name, email, password, role, branches)
- Choose **sidebar access** per employee (`allowedSections` on Employee)
- **Self-registration** at `/register` with admin approval workflow
- **Device sign-in approval:** new devices require admin/manager approval (not account-level pending)
- **Active/inactive toggle** decoupled from approval status
- Admins/managers always have full access

## i18n

- English + Kurdish Sorani (RTL)
- Language switcher on login and sidebar

## UI

- **Collapsible sidebar** — floating Menu/Hide toggle (top-left); preference saved in localStorage
- Full-width workspace when sidebar is hidden
- **Iraqi Dinar (IQD)** display and input in thousands shorthand

## Branches

- A, B, C, E, F + Storage (S)

## Production & Deploy

- **24/7 autonomous stack:** app + tunnel + keepalive + watchdog + recovery (PM2)
- **Self-healing:** auto-fixes Cloudflare Error 1033 within ~30 seconds — no manual steps
- One-command deploy: `npm run deploy` (restarts full stack + verifies public URL)
- Health check: `GET /health` | Version: `GET /api/version`
- If anything breaks: `npm run ensure:24-7`

---

## Database migrations (run on deploy)

```bash
npx prisma migrate deploy
npx prisma generate
```

Key migrations on `main`:
- `20260710120000_add_sale_item_qr_fields`
- `20260703140000_add_device_sign_in_requests`
- `20260810120000_add_employee_access_fields`
- `20260811120000_add_commission_entries`
- `20260811130000_iqd_thousands_scale`
- `20260811140000_add_fib_payment_method`
- `20260813120000_add_inventory_conversion_links`

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

**Production deploy (on server):**

```bash
git pull origin main
npm run deploy
```

Hard-refresh browser after deploy (Ctrl+Shift+R).

---

## If features are missing in the UI

This usually means the workspace is on an **old branch**, or production was not redeployed.

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
- `frontend/src/lib/plainClothApi.ts`
- `frontend/src/pages/PlainClothPricing.tsx`
- `FEATURES.md`

**Never deploy or demo from stale feature branches** — they lag behind `main` and lose QR scan, cut-sell, plain cloth, device sign-in, i18n, and other merged work.
