# Textile ERP

Full-stack inventory and sales system for textile branches (rolls, pieces, remnants, packages).

**Live stack:** Express + Prisma/PostgreSQL backend, React/Vite frontend.

## Login (seed)

- Email: `admin@textile.com`
- Password: `admin123`

## Features (saved on `main` as of v1.1.0-full-features)

### Inventory & New Item
- Family code + sub-code (price) + color + branch QR labels
- **Multiple rolls** per same family code, color, and price (unique instance keys + QR IDs)
- **Under 2 m rule:** rolls or piece lengths below 2 meters save as **remnants**
- Piece packages (multi-piece sets with component stock)
- Inventory search by QR/family code with **per-roll and per-length breakdown** (click stock numbers)
- Edit, archive/remove, and identity migration (code, color, price, length)

### Item Conversion
- Branch transfer with new destination QR
- Roll/remnant → piece cut; restocks existing sold-out piece (same family, color, length)
- Cuts under 2 m create remnants, not pieces
- Auto-complete cutting tasks on roll-to-piece

### Sales & Exchange
- Roll/remnant sold by meter; pieces by count
- Piece packages (full/partial)
- Plain cloth lines
- Exchange workflow with returns and replacements

### Cutting tasks
- Auto-create task when shelf pieces hit 0 but roll stock remains after piece sale
- Task Employee page with open-task badge on sidebar

### Owed Money
- Record payments with full vs partial balance preview

### i18n
- English + Kurdish Sorani (RTL), language switcher on login and sidebar

### Branches
- A, B, C, E, F + Storage (S)

## Development

```bash
npm install
npx prisma migrate deploy
npm run seed
npm run dev          # backend :3000
cd frontend && npm run dev   # frontend :5173
```

## Tags

- `v1.0.0-full-features` — initial full feature set on main
- `v1.1.0-full-features` — multiple rolls, inventory breakdown, under-2m remnant rule
