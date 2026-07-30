# textile-erp

Textile ERP: an Express v5 + Prisma (PostgreSQL) REST API (repo root) and a React 19 + Vite SPA (`frontend/`).

## Cursor Cloud specific instructions

### Services

| Service | Dir | Dev command | Port | Notes |
| --- | --- | --- | --- | --- |
| Backend API | `/workspace` | `npm run dev` (`tsx watch src/server.ts`) | 3000 | Must stay on 3000; the Vite dev server proxies `/api` → `http://localhost:3000` (`frontend/vite.config.ts`). |
| Frontend SPA | `/workspace/frontend` | `npm run dev` | 5173 | Uses relative `/api` (no `VITE_*` env vars). |
| PostgreSQL | — | see below | 5432 | Required by Prisma; the API `/health` and startup depend on it. |

### Database (not bundled, not in the default snapshot)

PostgreSQL is not preinstalled on the default cloud snapshot and is not installed by the update script. Bring it up manually each session if absent:

```bash
sudo apt-get install -y postgresql postgresql-contrib   # if not present
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE textile_erp;"   # ignore error if it already exists
```

### Required `.env` (repo root, gitignored)

The backend **throws on startup** if `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are missing, and Prisma needs `DATABASE_URL`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/textile_erp?schema=public"
JWT_ACCESS_SECRET="dev_access_secret_change_me"
JWT_REFRESH_SECRET="dev_refresh_secret_change_me"
PORT=3000
NODE_ENV=development
```

### One-time DB setup (after `.env` + running Postgres)

```bash
npx prisma migrate deploy   # apply existing migrations (use `migrate dev` only when authoring new ones)
npm run seed                # seed branches, colors, employees, sample inventory
```

Seeded logins: `admin@textile.com / admin123`, `manager@textile.com / manager123`, `employee@textile.com / employee123`.

### Gotchas

- `npm install` does **not** generate the Prisma client (no `postinstall`); run `npx prisma generate` (the update script and `.cursor/environment.json` install step already do this).
- `npm run build` / `tsc --noEmit` fail only because of the stray, unused `src/App.tsx` (a misplaced frontend file). The server runs via `tsx watch`, so dev is unaffected.
- `frontend` `npm run lint` reports pre-existing errors in app code; these are not environment issues.
