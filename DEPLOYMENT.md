# Deployment

**Production (current):** Cloudflare named tunnel at `https://erp.kutalimzhda.com` — see [README.md](./README.md#run-247-production) and `npm run deploy`.

**Alternative:** Render Blueprint (below) for hosted backend + static frontend + PostgreSQL.

## Render setup

- Backend: Render Web Service
- Frontend: Render Static Site
- Database: Render PostgreSQL

The included `render.yaml` can create all three services from one Render Blueprint.

## Render Blueprint steps

1. Push `main` to GitHub.
2. In Render, choose **New > Blueprint**.
3. Select this repository.
4. Render will create:
   - `textile-erp-api`
   - `textile-erp-web`
   - `textile-erp-db`
5. After the services are created, update these placeholders if Render assigns different URLs:
   - Backend `CORS_ORIGIN` should equal the frontend URL.
   - Frontend `VITE_API_BASE_URL` should equal the backend URL plus `/api`.
6. Redeploy both services after changing environment variables.

## Backend environment

See `.env.example`.

Required:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

Optional:

- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `CORS_ORIGIN`

## Frontend environment

See `frontend/.env.example`.

Required for separate frontend/backend hosting:

- `VITE_API_BASE_URL`

Example:

```text
VITE_API_BASE_URL=https://textile-erp-api.onrender.com/api
```

## Local verification

Backend:

```sh
npx prisma migrate deploy
npm run build:frontend
npm run start:prod
```

Frontend:

```sh
cd frontend
VITE_API_BASE_URL=http://localhost:3000/api npm run build
```

## Notes

- The backend exposes `/health` and `/api/version` for uptime and deploy checks.
- Prisma Client is generated during `postinstall`.
- The frontend is a single page app; `render.yaml` rewrites all routes to `index.html`.
