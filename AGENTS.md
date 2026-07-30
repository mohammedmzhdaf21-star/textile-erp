## Cursor Cloud specific instructions

- Product shape: Node/Express backend at the repo root, Prisma/PostgreSQL database, and Vite React frontend in `frontend/`.
- Dependency refresh is root `npm install` plus `npm install --prefix frontend`; keep service startup and database migrations out of the automatic update script.
- Backend runtime requires local PostgreSQL and a root `.env` with `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`; `.env` is intentionally gitignored. A local dev database named `textile_erp_dev` with user/password `textile`/`textile` was used successfully.
- After the database is available, run `npx prisma generate`, `npx prisma migrate deploy`, and `npm run seed` before exercising authenticated flows. Seeded login credentials are printed by `npm run seed` and include `admin@textile.com` / `admin123`.
- Dev services: run backend with `npm run dev` from the repo root and frontend with `npm run dev -- --host 0.0.0.0` from `frontend/`; the frontend Vite proxy forwards `/api` to `http://localhost:3000`.
- Current app code runs in dev mode, but compile/lint checks are not clean: root `npm run build`, frontend `npm run build`, frontend `npm run lint`, and root `npm test` have existing code/script failures.
