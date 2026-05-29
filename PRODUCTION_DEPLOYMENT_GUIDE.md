# ShipAmaze — Production Deployment Guide

Use this guide to deploy the ShipAmaze MERN stack (Vite/React frontend + Express/MongoDB API).

---

## Architecture overview

| Component | Recommended host | Notes |
|-----------|------------------|--------|
| Frontend (SPA) | **Vercel** | Static `frontend/dist`, SPA rewrites |
| API | **Render**, **Railway**, or **VPS + PM2** | Node 20+, `backend/dist/server.js` |
| Database | **MongoDB Atlas** | `mongodb+srv://` connection string |

---

## Prerequisites

- Node.js **20 LTS** (or 22) on build machines
- MongoDB Atlas cluster (production database user, IP allowlist)
- Domain names: e.g. `app.yourdomain.com` (frontend), `api.yourdomain.com` (API)
- Shopify Partners app (if using Shopify)
- Velocity Shipping credentials (if `VELOCITY_ENABLED=true`)
- Gmail App Password or SMTP (for transactional email)

---

## 1. Build locally (smoke test)

From repository root `shipamaze/`:

```bash
npm run build:all
```

This runs `backend` TypeScript compile and `frontend` Vite production build.

Verify:

```bash
cd backend && npm test
cd ../frontend && npm run typecheck
```

---

## 2. Backend deployment

### Option A — Render (recommended for API)

1. Create **Web Service**, connect Git repo.
2. **Root directory:** `backend`
3. **Build command:** `npm ci && npm run build`
4. **Start command:** `npm start`
5. **Health check path:** `/health`
6. Set environment variables (see §4).
7. Deploy and confirm: `GET https://api.yourdomain.com/health` → `{ "ok": true }`

### Option B — VPS with PM2

On the server:

```bash
cd /var/www/shipamaze
git pull
npm run build:backend
cd backend && npm ci --omit=dev
```

Copy `backend/.env` (never commit). Start with PM2 from repo root:

```bash
npm run start:pm2
# or: pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

**Restart after deploy:**

```bash
pm2 restart shipamaze-api
pm2 logs shipamaze-api --lines 100
```

Put **Nginx** or **Caddy** in front for HTTPS → `http://127.0.0.1:5000`.

---

## 3. Frontend deployment (Vercel)

1. Import project; **Root directory:** `frontend`
2. **Framework:** Vite
3. **Build command:** `npm ci && npm run build`
4. **Output directory:** `dist`
5. Environment variable (Production):

   | Key | Example |
   |-----|---------|
   | `VITE_API_BASE_URL` | `https://api.yourdomain.com/api` |

6. `vercel.json` already rewrites all routes to `index.html` for SPA routing.
7. Redeploy after any `VITE_*` change (baked at build time).

### Custom domain + SSL

- Vercel: Project → **Domains** → add `app.yourdomain.com` → follow DNS (CNAME).
- SSL is automatic on Vercel.

---

## 4. Environment variables

### Backend (required in production)

Copy from `backend/.env.example`. Set on Render/VPS:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` |
| `PORT` | `5000` (or host default) |
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | Long random string (32+ chars) |
| `ENCRYPTION_SECRET` | Separate random string (Shopify token encryption) |
| `CORS_ORIGIN` | `https://app.yourdomain.com` (comma-separated if multiple) |
| `FRONTEND_URL` | `https://app.yourdomain.com` |
| `SHOPIFY_API_KEY` | Partners app |
| `SHOPIFY_API_SECRET` | Partners app |
| `SHOPIFY_REDIRECT_URI` | `https://api.yourdomain.com/api/shopify/callback` |
| `SHOPIFY_SCOPES` | e.g. `read_orders,read_products` |
| `VELOCITY_ENABLED` | `true` if using Velocity |
| `VELOCITY_USERNAME` / `VELOCITY_PASSWORD` | Required when Velocity enabled |
| `EMAIL_FROM` / `EMAIL_PASS` | Gmail or use SMTP vars |

Optional:

| Variable | Description |
|----------|-------------|
| `JSON_BODY_LIMIT` | Default `1mb` in production |
| `RATE_LIMIT_*` | See `.env.example` |
| `SHOPIFY_WEBHOOK_URL` | Override webhook registration URL |

### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Must include `/api` suffix |

---

## 5. MongoDB Atlas setup

1. Create cluster (region near API).
2. Database user with read/write on app DB only.
3. Network access: Render outbound IPs or careful `0.0.0.0/0` with strong credentials.
4. Connection string: `mongodb+srv://user:pass@cluster.mongodb.net/shipamaze?retryWrites=true&w=majority`
5. Indexes are created from Mongoose schemas on connect (non-destructive).

### Backup

- Enable **Atlas continuous backup** or scheduled snapshots.
- Before major releases, take a manual snapshot.
- Do **not** run destructive seed scripts against production.

### Initial admin user

```bash
cd backend
# Set MONGODB_URI and run once:
npm run seed:users
```

Default seed accounts are in `src/scripts/seedUsers.ts` — **change passwords immediately** after first login.

---

## 6. Shopify configuration

1. Partners → App → **App URL** / **Allowed redirection URL(s):**
   - `https://api.yourdomain.com/api/shopify/callback`
2. Webhooks (auto-registered on OAuth):  
   `https://api.yourdomain.com/api/shopify/webhooks`
3. API credentials must match `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`.
4. After deploy, connect a test store from **Dropshipper → Channels**.

---

## 7. CORS and domains checklist

- [ ] `CORS_ORIGIN` matches exact frontend origin (scheme + host, no trailing slash)
- [ ] `FRONTEND_URL` set for Shopify OAuth redirect
- [ ] `VITE_API_BASE_URL` points to production API `/api`
- [ ] No `localhost` in production env on hosts

---

## 8. SSL

| Layer | How |
|-------|-----|
| Vercel frontend | Automatic |
| Render API | Automatic `*.onrender.com`; custom domain in Render settings |
| VPS | Let's Encrypt via Caddy/Nginx certbot |

Force HTTPS redirects at the reverse proxy.

---

## 9. Post-deploy verification

1. `GET /health` → 200
2. Register vendor/dropshipper (not admin via API)
3. Login, create order, print label
4. Public track: `/track` with AWB
5. Shopify connect + webhook test order
6. Wallet: admin adjust only (self top-up disabled in production)

See `FINAL_QA_CHECKLIST.md`.

---

## 10. Rollback

- **Render:** Deployments → previous deploy → Rollback
- **Vercel:** Promote previous production deployment
- **PM2:** Redeploy previous build artifact; `pm2 restart shipamaze-api`
- **Atlas:** Restore from snapshot if data issue

---

## 11. Related documents

- `PRODUCTION_RELEASE_CHECKLIST.md` — env & security checklist
- `OWNER_HANDOVER.md` — business/operator guide
- `FINAL_QA_CHECKLIST.md` — pre-launch QA
- `ecosystem.config.cjs` — PM2 process file
