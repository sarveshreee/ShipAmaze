# ShipAmaze (MERN)

Monorepo-style app: Vite + React frontend and Express + MongoDB backend.

## Frontend

1. In `frontend/`, copy `.env.example` to `.env` and set the API base URL (includes `/api` path):

   - `VITE_API_BASE_URL=http://localhost:5000/api`

2. From `frontend/`:

   ```bash
   npm install
   npm run dev
   ```

   The Vite dev server uses port `8080` by default (see `frontend/vite.config.ts`).

## First admin user

The signup UI only offers **vendor** and **dropshipper**. To create an **admin**, call the API once (e.g. with curl or Postman): `POST /api/auth/register` with JSON body `{ "email", "password", "name", "role": "admin" }` (optional `companyName`, `phone`). Then sign in at `/login` with that email.

## Backend

1. In `backend/`, copy `.env.example` to `.env` and set `MONGODB_URI` and `JWT_SECRET` (and any other variables your deploy needs).

2. Start MongoDB locally or point `MONGODB_URI` to your cluster.

3. From `backend/`:

   ```bash
   npm install
   npm run dev
   ```

   The API is expected to listen on port `5000` when using the default frontend env above; adjust if your `backend` uses another port and update `VITE_API_BASE_URL` accordingly.

## Build (frontend)

```bash
cd frontend
npm run build
```

This runs `vite build` for the frontend.
