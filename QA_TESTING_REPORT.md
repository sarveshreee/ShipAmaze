# ShipAmaze QA testing report

**Date:** 2026-05-12  
**Scope:** Automated test setup (backend Vitest + Supertest, frontend Vitest, Playwright E2E), targeted API/unit coverage, Shopify webhook raw-body verification fix, Admin Catalogue bulk API name fix, root `package.json` UTF-8 BOM removal (Vitest was failing to read the workspace package when resolving `file:..` from `frontend/package.json`).

---

## Phase 2 — Stabilization & type safety (2026-05-12)

### TypeScript fixes (frontend `npm run typecheck` now **green**)

| File | Issue | Fix |
|------|--------|-----|
| `AppLayout.tsx` | Unreachable duplicate `role === "vendor"` branch in `walletPagePath` | Removed dead branch; wallet links: vendor → `/vendor/wallet`, dropshipper → `/dropshipper/wallet`, admin → `/admin/finance`. |
| `orderLabelDom.ts` | `lineHeight` / `flexShrink` numeric values not assignable to `CSSStyleDeclaration` | Use string values `"1.35"` and `"0"`. |
| `RichOrdersTable.tsx` | `onCreateShipment` return type too narrow vs API | Widened `data` shape to match `POST /velocity/forward/create` (shipment_id, status, label_url, shipping_charges, etc.). |
| `StatusBadge.tsx` | `Record<OrderStatus, …>` missing `junk`, `shipped` | Added badge config for both statuses. |
| `AdminBilling.tsx` | `Invoice` imported from `invoiceService` but not exported there | Import `Invoice` from `@/types/logistics`; keep `InvoiceDetail` from service. |
| `PublicOrderDetail.tsx` | Unsafe cast `Order` → `Record<string, unknown>` | Cast via `unknown`. |
| `PublicTracking.tsx` | Invalid type predicate on activities | Removed predicate; normalize fields with `unknown` cast. |

### Automated commands run (Phase 2)

```text
cd backend && npm run typecheck && npm run test && npm run build
cd frontend && npm run typecheck && npm run test && npm run build
cd .. && npm run test:e2e   # requires dev servers on 8080/5000; fails with ERR_CONNECTION_REFUSED if not running
```

### E2E note

`npm run test:e2e` with `E2E_SKIP_WEBSERVER=1` still needs the **frontend** listening on `E2E_BASE_URL` (default `http://127.0.0.1:8080`). Start `npm run dev` in `frontend` and `backend` first, or omit `E2E_SKIP_WEBSERVER` so Playwright starts both (requires valid `backend/.env` with `MONGODB_URI`).

### Manual stabilization checklist (Phase 2 — run on staging)

**Auth:** login, signup, forgot password, role redirects after login.

**Orders:** create order, bulk upload, process selected, status changes, search/date filters, order detail drawer.

**Wallet:** add funds (manual test mode), transaction list, admin wallet adjust, shipment charge path if applicable.

**Pickup:** add / edit / delete / set default; create order using pickup.

**Shopify:** connect, status, sync orders, disconnect.

**Velocity:** serviceability, create shipment, tracking, cancel, error toast on API failure.

**Public:** `/track`, `/order-detail` with valid and invalid IDs.

**UI:** loading states, empty states, mobile sanity on orders table (no full redesign).

---

## Commands executed (this audit)

```text
cd backend
npm install
npm run typecheck
npm run test

cd ../frontend
npm install
npm run typecheck   # green after Phase 2 TS fixes
npm run test
npm run build

cd ..
npm install
npx playwright install chromium
```

**Playwright:** Full E2E was not executed against live servers in this session (requires `MONGODB_URI` in `backend/.env` for the API dev server and optional role credentials). With `E2E_SKIP_WEBSERVER=1`, run `npx playwright test` only when frontend (port 8080) and backend (port 5000) are already up.

---

## Phase 1 — Project map (workflows ↔ code)

| Module | Backend (`backend/src/app.ts` prefixes `/api`) | Frontend routes / areas |
|--------|--------------------------------------------------|---------------------------|
| **Auth** | `/auth/register`, `/auth/login`, `/auth/verify-email-otp`, `/auth/resend-email-otp`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/me`, profile, change-password | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `AuthContext`, `RoleProtectedRoute` in `App.tsx` |
| **Orders** | `/orders`, `/orders/:orderId`, POST create, bulk, shipment, junk, status | Admin/dropshipper/vendor order pages via `OrdersPageWithTabs`, `CreateOrder`, `BulkUpload` |
| **Pickup** | `/pickup-addresses`, `/pickups` | `/dropshipper/pickup-addresses`, `DropshipperPickupAddresses` |
| **Wallet** | `/wallet`, `/wallet/add-funds`, `/wallet/transactions`, admin `/admin/wallets/*` | `/dropshipper/wallet`, `/vendor/wallet`, `AddFundsModal` |
| **Shopify** | `/shopify/connect`, `/shopify/callback`, `/shopify/status`, `/shopify/disconnect`, `/shopify/sync-orders`, webhooks `POST /shopify/webhooks` | `/dropshipper/channels`, `ShopifyConnect` |
| **Velocity** | `/velocity/*` router (serviceability, rates, forward/reverse, cancel, track, public track) | `velocityService`, dropshipper rates/tracking |
| **Admin** | vendors, dropshippers, support, catalogue, invoices, manifests, couriers, pincodes, tab permissions, label-invoice settings | `/admin/*` routes in `App.tsx` |
| **Vendor** | products, warehouses, marketplace | `/vendor/*` |
| **NDR / Returns / Weight disputes** | `/ndr`, `/returns`, `/weight-disputes` | Matching dropshipper + admin pages |
| **Public** | `/orders/track/:awb`, `/orders/public/:orderId` | `/track`, `/order-detail` |

**Guards:** `authMiddleware` + `requireRoles` in `roleMiddleware.ts` for admin-only and multi-role routes.

---

## Phase 2–3 — Tests added

### Backend (`vitest`)

| File | Purpose |
|------|---------|
| `src/test/testEnv.ts` | Safe default env for tests (Shopify/JWT/encryption placeholders). |
| `src/app.health.test.ts` | `/health`, 404 smoke (no DB). |
| `src/shopify.webhook.hmac.test.ts` | Webhook HMAC rejections (Supertest); valid HMAC via **raw** HTTP body (`fetch` + `http.createServer`) so `express.raw` receives a `Buffer`. |
| `src/services/shopifyOrderSync.unit.test.ts` | Pure helpers: external order id, financial/status mapping. |
| `src/integration/api.integration.test.ts` | **Skipped unless `MONGODB_URI_TEST`:** signup/OTP/login, forgot-password flow, pickups + orders + wallet + admin wallet adjust + tab permissions + Shopify status/connect JSON + Velocity with mocked `fetch`. |

### Frontend (`vitest`)

| File | Purpose |
|------|---------|
| `src/services/authService.test.ts` | `roleDashboardPath` for all roles. |

### E2E (`playwright`)

| File | Purpose |
|------|---------|
| `e2e/helpers.ts` | Shared login helper. |
| `e2e/workflows.spec.ts` | Admin / dropshipper / vendor flows (skipped without env creds). |
| `e2e/public-tracking.spec.ts` | Public `/track` invalid ID behaviour. |

**Config:** `playwright.config.ts` at repo root; scripts in root `package.json`.

---

## Bugs found

1. **Shopify webhook test / raw body:** Supertest did not preserve a `Buffer` for `express.raw`, so HMAC verification failed (401). Fixed by sending the webhook with Node `fetch` + `http.createServer` in the positive-path test.
2. **Admin Catalogue bulk action:** `AdminCatalogue.tsx` called non-existent `adminBulkCatalog`; service exports `adminBulkCatalogue` — runtime bulk actions would fail. Renamed the call site.
3. **Root `package.json` UTF-8 BOM:** Broke Vitest when resolving the parent workspace package (`shipamaze`: `file:..` in frontend). BOM stripped with PowerShell so JSON parses cleanly.

---

## Bugs fixed

- Items (1)–(3) above.

---

## Bugs / gaps still pending

- **E2E against local stack:** Run with both servers up (or let Playwright spawn them). Role tests remain skipped without `*_TEST_EMAIL` / `*_TEST_PASSWORD`.
- **DB-backed integration:** `MONGODB_URI_TEST` optional for `api.integration.test.ts`.
- **Manual smoke (auth, wallet, Shopify, Velocity, etc.):** Not executed in this agent session; use the checklists below on staging.

---

## Environment variables

| Variable | Use |
|----------|-----|
| `MONGODB_URI_TEST` | Enables backend integration tests (`api.integration.test.ts`). |
| `MONGODB_URI`, `JWT_SECRET`, etc. | Normal backend dev/prod (see `backend/.env.example`). |
| `ADMIN_TEST_EMAIL`, `ADMIN_TEST_PASSWORD`, `VENDOR_*`, `DROPSHIPPER_*` | Playwright role tests (`e2e/workflows.spec.ts`). |
| `E2E_BASE_URL` | Playwright base URL (default `http://127.0.0.1:8080`). |
| `E2E_SKIP_WEBSERVER=1` | Do not spawn dev servers from Playwright; use your own `npm run dev`. |

See **`.env.test.example`** at the repo root.

---

## Manual testing checklist (before launch)

- [ ] Auth: register each role, email OTP, login, forgot password, blocked/inactive user messaging.
- [ ] Orders: manual create, bulk CSV, list tabs, detail drawer, status transitions, junk, shipment flow with real Velocity sandbox.
- [ ] Wallet: manual test recharge, admin adjust/debit rules, insufficient balance on shipment.
- [ ] Shopify: OAuth on a dev store, sync orders, webhook delivery in Partner dashboard, disconnect.
- [ ] Admin: vendor/dropshipper CRUD, support tickets, invoice status, manifests.
- [ ] Role isolation: vendor cannot open `/admin`; dropshipper cannot open vendor-only APIs (403).
- [ ] Public tracking and label/invoice public settings.

### Admin → Orders (All / Channel / Manual) — 2026-05-12 update

**Implemented:** Shared `OrdersPageWithTabs` + `GET /api/orders` now support (1) **Process Selected** on every admin tab except Junk, wired to `POST /api/orders/process-selected` with courier/pickup/dimensions; button disabled unless every selected row is Ready to Ship with no AWB and no shipment created. (2) **From / To date** filters on `createdAt` (query params `dateFrom` / `dateTo`, aliases `fromDate` / `toDate`). (3) **Search** bar debounced (~300ms) passes `q`; backend `buildSearchQuery` matches tracking, order id, customer, phones, products/SKUs, `trackingUrl`, `channel`, and Mongo `_id` for 24-char hex.

**Backend unit tests:** `backend/src/utils/orderFilters.search.unit.test.ts` (search + date alias parsing).

**Manual checklist (admin orders):**

- [ ] Admin → Orders → **All** → select 2 Ready-to-Ship orders (no AWB) → **Process Selected** completes → selection clears and list refetches.
- [ ] Admin → Orders → **Channel** → same Process Selected flow.
- [ ] Admin → Orders → **Manual** → same Process Selected flow.
- [ ] Search by **tracking ID** / **AWB** returns the expected order.
- [ ] Search by **mobile** returns the expected order.
- [ ] Search by **customer name** returns the expected order.
- [ ] Search by **product SKU** returns the expected order.
- [ ] **From date** / **To date** narrow the list correctly (uses `createdAt`).
- [ ] Changing tab, search, or dates refetches correctly (query key includes filters).
- [ ] Vendor/dropshipper order lists and APIs unchanged (admin-only process-selected; visibility query unchanged for non-admin).

---

## Launch readiness

| Area | Status |
|------|--------|
| Backend unit/smoke tests | **Green** without `MONGODB_URI_TEST`. |
| Backend integration | **Not run** here (needs `MONGODB_URI_TEST`). |
| Frontend unit tests | **Green** (minimal coverage). |
| Frontend typecheck | **Green** (`tsc -b`) — Phase 2 fixes. |
| Frontend production build | **Green** (Vite). |
| E2E | **Requires running stack** — `ERR_CONNECTION_REFUSED` if UI not on port 8080. |

**Overall:** Backend and frontend typecheck/build/unit tests are green. Complete **manual QA** and **E2E on a staging URL** before production cutover.
