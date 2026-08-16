# ShipAmaze testing guide

## Phase 2 status (type safety)

Frontend **`npm run typecheck`** (`tsc -b`) passes after fixes in `AppLayout`, `orderLabelDom`, `RichOrdersTable`, `StatusBadge`, `AdminBilling`, `PublicOrderDetail`, and `PublicTracking`. Run:

```bash
cd frontend && npm run typecheck && npm run test && npm run build
```

## Prerequisites

- Node.js 20+ recommended.
- **Backend integration tests** (`backend/src/integration/api.integration.test.ts`) run only when `MONGODB_URI_TEST` is set to a **non-production** database. They use `describe.skipIf` when it is missing.
- **E2E tests** use Playwright. Role-based scenarios are skipped unless the corresponding `*_TEST_EMAIL` / `*_TEST_PASSWORD` variables are set.

## Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
cd .. && npm install
```

Install the Chromium browser for Playwright (once per machine):

```bash
npx playwright install chromium
```

## Backend

| Command | Description |
|--------|-------------|
| `npm run typecheck` | TypeScript check (`tsc --noEmit`). |
| `npm run test` | Vitest unit + integration (integration skipped without `MONGODB_URI_TEST`). |
| `npm run build` | Compile to `dist/`. |

From repo root:

```bash
npm run test:backend
```

### Test database

Set `MONGODB_URI_TEST` to a **dedicated** database (for example `mongodb://127.0.0.1:27017/shipamaze_test`). Do **not** point this at development or production data.

The database name must contain `test` (e.g. `shipamaze_test`). Integration tests call `prepareCleanIntegrationTestDb()`, which **drops the entire test database** before syncing indexes — only when `MONGODB_URI_TEST` is set and validated.

If a polluted test database prevented `Order.syncIndexes()` (duplicate `{ partnerId, partnerReferenceId: null }` rows), drop the test database manually or let the integration harness recreate it on the next run.

Partner integration tests:

```bash
cd backend
export MONGODB_URI_TEST=mongodb://127.0.0.1:27017/shipamaze_test
npm run test:integration:partner
```

### Order list filters (search / dates)

Vitest file `backend/src/utils/orderFilters.search.unit.test.ts` covers `buildSearchQuery` and `parseOrderListQuery` date aliases (`fromDate` / `toDate` → `createdAt` range). Full list behaviour still needs manual or integration checks against MongoDB.

## Frontend

| Command | Description |
|--------|-------------|
| `npm run typecheck` | Project references build (`tsc -b`). |
| `npm run test` | Vitest + React Testing Library (`src/**/*.test.ts(x)`). |
| `npm run build` | Vite production build. |
| `npm run lint` | ESLint. |

From repo root:

```bash
npm run test
npm run typecheck
```

## End-to-end (Playwright)

1. Ensure the API and UI are reachable (default `http://127.0.0.1:5000` and `http://127.0.0.1:8080`). The Vite app uses `VITE_API_BASE_URL` in non-dev builds; in dev it defaults to `http://localhost:5000/api`.
2. Export credentials from `.env.test.example` (copy to `.env.test` and `Get-Content .env.test | ForEach-Object { if ($_ -match '^([^#][^=]+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] } }` on PowerShell, or set variables in CI).
3. Run:

```bash
npm run test:e2e
```

`playwright.config.ts` starts `npm run dev` in `backend/` and `frontend/` when `E2E_SKIP_WEBSERVER` is not set to `1`, and uses `reuseExistingServer: true` so locally you can keep your own dev servers running.

## Mocking external services

| Area | Approach in this repo |
|------|------------------------|
| **Shopify** | Webhook HMAC tests use `SHOPIFY_API_SECRET` from `backend/src/test/testEnv.ts` defaults. OAuth/token exchange is not hit in unit tests. `shopifyOrderSync.unit.test.ts` covers pure mapping helpers. |
| **Velocity** | Integration tests stub `globalThis.fetch` for `/auth-token` and downstream paths (see `api.integration.test.ts`). |
| **Email / payments** | API integration tests avoid asserting outbound mail. Wallet top-up uses `POST /wallet/add-funds` with `mode: manual_test` (no gateway). |

## Root shortcuts

```bash
npm run typecheck    # backend + frontend typecheck
npm run test:all     # backend + frontend unit/integration tests
npm run build:all    # backend tsc + frontend vite build
npm run test:e2e     # Playwright
```
