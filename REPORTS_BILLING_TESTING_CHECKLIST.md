# Reports, Billing & Exports — Manual Testing Checklist

Use this after deploy or before release to verify **Admin Reports**, **Billing & Invoices**, **CSV exports**, **permissions**, and **mobile UX**. All data should come from the API (no mocked totals in production flows).

## Prerequisites

- Backend and frontend running with a known **admin**, **vendor**, and **dropshipper** account.
- Seed or create: orders in multiple statuses, at least one shipment, wallet transactions, COD remittance rows if applicable, and invoices (paid / unpaid / overdue / cancelled where possible).
- Browser devtools **Network** tab open to confirm requests and `Content-Disposition` filenames on downloads.

---

## 1. Admin Reports — Summary & filters

| # | Step | Expected |
|---|------|----------|
| 1.1 | Open **Admin → Reports**. | Page loads; summary KPIs and charts populate from `GET /api/reports/summary` (not hardcoded demo numbers). |
| 1.2 | Change **date range** (preset + custom). | Summary and orders table refresh; params match selection. |
| 1.3 | As **admin**, pick **Account / user scope** (vendor or dropshipper). | Data narrows to that user’s orders only. |
| 1.4 | As **vendor** or **dropshipper**, open Reports. | Scope is own data only; no control to select another account (or selecting another ID has no effect server-side). |
| 1.5 | Filter by **order status**, **payment mode**, **source**, **courier**. | Tables and summary reflect filters; **filter chips** show active filters. |
| 1.6 | Click **Clear filters**. | All filters reset; data reloads for default range. |
| 1.7 | Simulate API error (e.g. stop backend). | **Error** state with **retry**; no silent empty KPIs that look like “zero business”. |
| 1.8 | Empty dataset (filters that match nothing). | **Empty** state copy; no crash. |

---

## 2. Admin Reports — Orders table & pagination

| # | Step | Expected |
|---|------|----------|
| 2.1 | Scroll to orders table. | Rows from `GET /api/reports/orders` with `page` / `pageSize`. |
| 2.2 | Next / previous page (or equivalent). | Correct page; total count consistent. |
| 2.3 | Apply filters; paginate. | Filters persist across pages. |
| 2.4 | Narrow viewport (mobile or responsive mode). | Table scrolls horizontally or stacks without breaking layout. |

---

## 3. CSV exports — Reports page

| # | Step | Expected |
|---|------|----------|
| 3.1 | With filters applied, click **Orders CSV**. | `GET /api/exports/csv?type=orders&...` returns file; filename includes date and is safe (no odd characters). |
| 3.2 | **Shipments CSV** with same filters. | `type=shipments`; columns sensible; no passwords or API tokens. |
| 3.3 | As **non-admin**, export. | Only own rows (orders/shipments tied to scoped user). |
| 3.4 | As **admin**, scoped to user A, export. | File contains user A’s data only. |
| 3.5 | Large dataset (if available). | Export may cap rows (e.g. 10k) and append a truncation notice row if limit hit — verify behavior matches backend. |
| 3.6 | After download. | User sees **feedback** (toast or message) that CSV started/completed. |

---

## 4. Billing — Invoice list

| # | Step | Expected |
|---|------|----------|
| 4.1 | Open **Admin → Billing** (or equivalent). | `GET /api/invoices` returns `{ items, total, page, pageSize }`. |
| 4.2 | Filter by **date** and **status**. | List matches filters. |
| 4.3 | Paginate invoices. | Correct totals and pages. |
| 4.4 | Empty list. | Empty state, not infinite loading. |

---

## 5. Billing — Invoice detail & status

| # | Step | Expected |
|---|------|----------|
| 5.1 | Open invoice **detail** (drawer or page). | `GET /api/invoices/:invoiceId` loads line items / metadata. |
| 5.2 | **Download** when `downloadUrl` or file exists. | Opens or downloads linked asset. |
| 5.3 | **Invoice CSV** (`/invoices/:id/export.csv`). | CSV downloads; no secrets in columns. |
| 5.4 | If PDF pipeline not implemented. | **Graceful** message / stub generate path; no hard crash. |
| 5.5 | As **admin**, change status (paid / unpaid / overdue / cancelled). | `PATCH /api/invoices/:id/status` succeeds; UI updates. |
| 5.6 | As **vendor**, attempt status change on another user’s invoice (if UI exposes it). | Server rejects or hides action. |

---

## 6. COD remittances

| # | Step | Expected |
|---|------|----------|
| 6.1 | Billing tab **COD** list. | Paginated `{ items, total, page, pageSize }` from wallet/cod API. |
| 6.2 | **COD CSV** from Billing. | `GET /api/exports/csv?type=cod&...`; scoped correctly. |

---

## 7. Wallet transaction export

| # | Step | Expected |
|---|------|----------|
| 7.1 | From Billing (or Finance if wired), **Wallet CSV**. | `type=wallet`; only allowed transactions for current role; admin can export all or scoped. |
| 7.2 | Inspect CSV. | No internal tokens, refresh tokens, or passwords. |

---

## 8. Invoices bulk export

| # | Step | Expected |
|---|------|----------|
| 8.1 | **Invoices CSV** from Billing. | `type=invoices`; respects date/status filters where implemented. |

---

## 9. Security & permissions

| # | Step | Expected |
|---|------|----------|
| 9.1 | Non-admin calls `scopeUserId` (or equivalent) for another user’s ID. | Backend ignores or returns 403; never returns other tenant’s rows. |
| 9.2 | Unauthenticated `GET` on `/api/reports/*`, `/api/exports/csv`, `/api/invoices*`. | 401/403 as per app auth middleware. |
| 9.3 | Export column audit. | No `password`, `token`, `secret`, `authorization` fields. |

---

## 10. UX — Loading, error, mobile

| # | Step | Expected |
|---|------|----------|
| 10.1 | Throttle network to **Slow 3G**. | Loading skeletons or spinners on Reports and Billing. |
| 10.2 | Mobile width. | Summary cards stack; tables scroll; filter chips wrap; primary actions reachable. |
| 10.3 | Retry after error. | Second successful load restores content without full page reload (if implemented). |

---

## 11. Regression — PDF (if used)

| # | Step | Expected |
|---|------|----------|
| 11.1 | Reports **PDF** from on-screen data (if present). | PDF reflects current filtered table/summary source; does not invent months of revenue. |

---

## Sign-off

| Role | Name | Date | Pass / Fail |
|------|------|------|-------------|
| QA | | | |
| Dev | | | |
