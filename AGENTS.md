# textile-erp

Textile ERP: Express + Prisma (PostgreSQL) REST API (repo root) and React + Vite SPA (`frontend/`).

## Cursor Cloud specific instructions

### Services

| Service | Dir | Dev command | Port | Notes |
| --- | --- | --- | --- | --- |
| Backend API | `/workspace` | `npm run dev` | 3000 | Vite dev server proxies `/api` → `http://localhost:3000` |
| Frontend SPA | `/workspace/frontend` | `npm run dev` | 5173 | Uses relative `/api` |
| PostgreSQL | — | see below | 5432 | Required by Prisma |

### Required `.env` (repo root, gitignored)

```
DATABASE_URL="postgresql://textile:textile@localhost:5432/textile_erp"
JWT_ACCESS_SECRET="dev_access_secret_change_me"
JWT_REFRESH_SECRET="dev_refresh_secret_change_me"
PORT=3000
NODE_ENV=development
```

### One-time DB setup

```bash
npx prisma migrate deploy
npm run seed
```

Seeded logins: `admin@textile.com / admin123`, `manager@textile.com / manager123`, `employee@textile.com / employee123`.

### Production deploy

Always work from `main`. On the production server:

```bash
git pull origin main
npm run deploy
```

See [FEATURES.md](./FEATURES.md) for the full feature checklist.
