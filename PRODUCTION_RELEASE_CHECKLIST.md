# Production release checklist — ShipAmaze MERN

Use this before pointing a production domain at the app or handing off to stakeholders.

## 1. Environment variables

### Backend (Render or other Node host)

Copy from `backend/.env.example`. **Never commit real `.env` files.**

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | Usually injected by host (Render sets automatically). |
| `MONGODB_URI` | Atlas connection string (see §3). **Required.** |
| `JWT_SECRET` | Long random string. **Required in production.** No default. |
| `CORS_ORIGIN` | Frontend origin(s), comma-separated. **Required in production.** |
| `ENCRYPTION_SECRET` | Separate from JWT; used for Shopify token encryption. **Required in production.** |
| `FRONTEND_URL` | Optional; OAuth redirect after Shopify. If unset, first `CORS_ORIGIN` entry is used. |
| `SHOPIFY_API_KEY` | **Required in production** (validated at startup). |
| `SHOPIFY_API_SECRET` | **Required in production.** |
| `SHOPIFY_REDIRECT_URI` | Must match Shopify app settings, e.g. `https://<api-host>/api/shopify/callback`. |
| `SHOPIFY_SCOPES` | As registered in Shopify Partners. |
| `VELOCITY_ENABLED` | `true` only if Velocity is used; then `VELOCITY_USERNAME` and `VELOCITY_PASSWORD` are **required**. |
| `VELOCITY_BASE_URL` | Default `https://shazam.velocity.in` if omitted. |
| `EMAIL_FROM`, `EMAIL_PASS` | Optional transactional email: Gmail address + App Password (preferred names; same as `GMAIL_*`). App starts without them; outbound mail is skipped with a startup warning. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Optional; used if `EMAIL_FROM` / `EMAIL_PASS` are not set. |
| Custom SMTP (`SMTP_*`, `MAIL_FROM_EMAIL`, …) | Optional fallback if Gmail-style vars are not set. |

Optional tuning: `MONGODB_CONNECT_RETRIES`, `RATE_LIMIT_*` (see `.env.example`).

### Partner API (when enabled)

| Variable | Production value |
|----------|------------------|
| `PARTNER_API_ENABLED` | `true` when API is live |
| `PARTNER_WALLET_BILLING_ENABLED` | `true` for Lorrigo/Ekart wallet debit |
| `PARTNER_RATE_LIMIT_STORE` | `mongo` (never `memory` on multi-instance) |
| `PARTNER_RATE_LIMIT_PASS_ON_STORE_ERROR` | `true` (default) |

Confirm Atlas indexes before live partners:

- `orders.partnerId_1_partnerReferenceId_1` — unique + sparse
- `partneridempotencyrecords.partnerId_1_idempotencyKey_1` — unique
- `partneridempotencyrecords.expiresAt_1` — TTL `expireAfterSeconds: 0`
- `transactions` unique partial on `userId + referenceType + referenceId`

See `docs/partner-api-runbook.md` and `docs/partner-api-limitations.md`.

### Frontend (Vercel)

| Variable | Notes |
|----------|--------|
| `VITE_API_BASE_URL` | Full API base including `/api`, e.g. `https://your-api.onrender.com/api`. **Required for production build.** |

Local dev may omit it; Vite falls back to `http://localhost:5000/api` in `import.meta.env.DEV` only.

## 2. Build commands

| Project | Command | Output |
|---------|---------|--------|
| Backend | `npm ci` → `npm run build` (`tsc`) | `backend/dist/` |
| Backend start | `npm start` → `node dist/server.js` | — |
| Frontend | `npm ci` → `npm run build` | `frontend/dist/` |

Run locally before release:

```bash
cd backend && npx tsc --noEmit && npm run build
cd ../frontend && npx tsc --noEmit && npm run build
```

## 3. MongoDB Atlas

- [ ] Cluster in the same region as the API when possible.
- [ ] Database user with least privilege (read/write on the app DB only).
- [ ] Network access: allow Render outbound IPs or `0.0.0.0/0` if using Atlas IP allowlist with care.
- [ ] `MONGODB_URI` uses TLS (`mongodb+srv://` recommended).
- [ ] **Indexes**: application models define indexes (e.g. `User.email` unique, `Order.orderId` unique, `ShopifyWebhookReceipt.deliveryId` unique + TTL on `expiresAt`, wallet `Transaction` compound indexes). New indexes are created on connection — **non-destructive**; review Atlas “slow query” advice after launch.

**Do not** run ad-hoc scripts that delete production data.

## 4. Deployment steps

### Render (API)

1. New **Web Service**, connect repo; set **Root Directory** to `backend`.
2. Build: `npm ci && npm run build` — Start: `npm start`.
3. Set env vars from §1; redeploy.
4. Health check path: `/health` (returns JSON `ok: true`).
5. Confirm `GET https://<service-url>/health` returns 200.

### Vercel (frontend)

1. Import repo; **Root Directory** `frontend` (if monorepo).
2. Framework: Vite. Set `VITE_API_BASE_URL` for **Production** (and Preview if you use a staging API).
3. `vercel.json` rewrites all routes to `index.html` for SPA deep links and refresh.
4. Redeploy after env changes (Vite bakes `VITE_*` at build time).

### CORS

Backend `CORS_ORIGIN` must include the exact Vercel origin(s), e.g. `https://your-app.vercel.app` (no trailing slash).

## 5. Shopify

- [ ] App **Allowed redirection URL(s)** include production `SHOPIFY_REDIRECT_URI`.
- [ ] Webhook URL reachable: `https://<api-host>/api/shopify/webhooks` (POST, raw JSON body for HMAC). Registered automatically on OAuth via `ensureShopifyWebhooksRegistered` (optional override: `SHOPIFY_WEBHOOK_URL`).
- [ ] API credentials in env match the Partners app.

## 6. Velocity (if enabled)

- [ ] `VELOCITY_ENABLED=true` in production only when the integration is live.
- [ ] `VELOCITY_USERNAME` / `VELOCITY_PASSWORD` set; optional `VELOCITY_BASE_URL`.
- [ ] Do **not** enable `VELOCITY_DEBUG_LOGS` in production unless diagnosing issues.

## 7. Smoke tests

After deploy, run through `SMOKE_TEST_CHECKLIST.md` (auth, pickup, order, wallet, Velocity, tracking, Shopify, admin, reports/billing).

## 8. Rollback

- **Render**: Deployments tab → select previous successful deploy → **Rollback**.
- **Vercel**: Deployments → previous production deployment → **Promote to Production**.
- **Atlas**: rely on backups/snapshots; application does not auto-drop collections on deploy.

## 9. Known limitations

- Transactional email requires `EMAIL_FROM`+`EMAIL_PASS`, `GMAIL_USER`+`GMAIL_APP_PASSWORD`, or custom SMTP; otherwise outbound mail is skipped (startup warning only).
- Shopify OAuth state is stored in MongoDB (`OAuthState` collection, 10-minute TTL on `expiresAt`) — safe for horizontal scaling on Render.
- CSV exports and reports may cap row counts (see API docs / `REPORTS_BILLING_TESTING_CHECKLIST.md`).
- No real payment gateway is integrated; wallet/top-up flows are application-level only.

## 10. Security notes (post-deploy)

- Confirm `GET /health` is the only unauthenticated path you intend to expose broadly.
- Rate limits apply to auth, password reset, Shopify OAuth, and public tracking (see `backend/src/middleware/rateLimits.ts`).
- `helmet` and JSON body size limits are enabled on the API.
