# ShipAmaze — Final QA Checklist

Complete before production launch. Check each item on **staging** that mirrors production env, then spot-check on production after deploy.

**Tester:** _______________  
**Date:** _______________  
**Environment URL:** _______________

---

## Authentication & accounts

- [ ] **Login** — valid vendor, dropshipper, admin credentials
- [ ] **Login** — wrong password shows clear error
- [ ] **Signup** — vendor and dropshipper only (no admin option in UI)
- [ ] **Signup** — API rejects `role: admin` (403) if tested via API tool
- [ ] **Email verification** — OTP flow works when email configured
- [ ] **Forgot password** — reset email/OTP (if email configured)
- [ ] **Logout** — session cleared; protected routes redirect to login
- [ ] **Blocked/inactive** user cannot access API

---

## Orders

- [ ] **List orders** — pagination, tabs, search
- [ ] **Create order** (dropshipper) — manual order saves
- [ ] **Bulk upload** — CSV validate → import
- [ ] **Order detail** — line items, status, pickup snapshot
- [ ] **Move to junk** — order leaves active tabs
- [ ] **Bulk move to Ready to Ship** — status updates
- [ ] **Process selected** (admin) — with pickup + courier
- [ ] **Role visibility** — vendor/dropshipper only see allowed orders

---

## Labels & documents

- [ ] **Print shipping label** — opens print dialog, readable barcode
- [ ] **Download label PDF**
- [ ] **Invoice PDF** (if used)
- [ ] **Admin label settings** — logo, company name, toggles apply to preview
- [ ] **Label sizes** — 4×6 / A6 / A5 render correctly

---

## Shipments (Velocity)

- [ ] **Serviceability** — pincode check returns couriers
- [ ] **Rates** — quote for sample order
- [ ] **Create forward shipment** — AWB assigned, wallet debited
- [ ] **Tracking** — AWB shows timeline (authenticated + public `/track`)
- [ ] **Restricted dropshipper** — cannot access blocked features
- [ ] **Legacy stub shipment** — disabled in production (`503` on `/orders/create-shipment`)

---

## Shopify

- [ ] **Connect store** — OAuth completes, redirects to channels
- [ ] **Status** — shows connected shop
- [ ] **Sync orders** — manual sync imports orders
- [ ] **Webhook** — new Shopify order appears (test store)
- [ ] **Disconnect** — store inactive
- [ ] **Push to Shopify** (marketplace) — shows “Coming soon” in production (no fake success)

---

## Wallet & billing

- [ ] **View balance** — header + wallet page
- [ ] **Transactions** — credits/debits listed
- [ ] **Self top-up** — blocked in production (403 or UI hidden)
- [ ] **Admin wallet adjust** — credit/debit target user
- [ ] **Insufficient balance** — shipment blocked with clear message

---

## Tracking (public)

- [ ] **`/track`** — search by AWB returns status + timeline
- [ ] **`/track`** — search by order ID (no AWB) shows pending/safe fields
- [ ] **No full address/phone/email** in network response (inspect API JSON)
- [ ] **Rate limit** — excessive requests throttled (optional stress test)

---

## Permissions

- [ ] **Admin → Permissions** — disable tab for test user
- [ ] **User** — disabled tab hidden from sidebar
- [ ] **Re-enable** — tab returns

---

## Vendor flow

- [ ] **Vendor login** → dashboard
- [ ] **Products** — create/edit product
- [ ] **Bulk upload products** — CSV import
- [ ] **Warehouse** — create/edit warehouse
- [ ] **Vendor orders** — list loads

---

## Dropshipper flow

- [ ] **Dashboard** — stats/widgets load
- [ ] **Channels** — Shopify connect path
- [ ] **Pickup addresses** — CRUD + default
- [ ] **Add order / Create order** — full flow
- [ ] **Wallet** — balance + transactions
- [ ] **Settings** — KYC form saves (draft)

---

## Admin flow

- [ ] **All admin nav pages** load without console errors
- [ ] **Dropshippers / Vendors** — list, patch status/access
- [ ] **Courier priority** — create rule, evaluate
- [ ] **Reports** — summary + CSV export
- [ ] **Support tickets** — reply as admin
- [ ] **Finance** — wallet list + adjust

---

## Mobile UI

Test on phone or DevTools mobile (375px width):

- [ ] **Sidebar** — opens/closes; no horizontal page scroll
- [ ] **Bottom nav** — visible on dropshipper/vendor/admin; links work
- [ ] **Safe area** — content not hidden behind bottom nav (iOS)
- [ ] **Orders table** — horizontal scroll works inside table wrapper
- [ ] **Bulk upload** — steps usable on small screen
- [ ] **Profile / Settings** — forms not clipped
- [ ] **Modals** — Add funds, process order, drawers fit viewport
- [ ] **Track shipment** (embedded) — search + results readable

---

## Dark mode

Toggle theme in app header:

- [ ] **Orders table** — text and borders readable
- [ ] **Cards / modals** — `bg-card`, not white boxes
- [ ] **Sidebar** — contrast OK
- [ ] **Toasts** — readable in dark mode
- [ ] **Public tracking** — embedded + standalone
- [ ] **Profile page** — inputs and labels visible
- [ ] **Dropdowns / popovers** — background matches theme

---

## Performance & stability

- [ ] **Cold load** — login page < 5s on 4G (approximate)
- [ ] **Orders page** — acceptable load with 50+ rows
- [ ] **No white screen** on lazy routes (Settings, Reports, Bulk Upload)
- [ ] **API `/health`** — 200 under load

---

## Security spot checks

- [ ] Production `.env` not in git
- [ ] `JWT_SECRET` / `ENCRYPTION_SECRET` are strong unique values
- [ ] `CORS_ORIGIN` is production frontend only
- [ ] Public tracking API returns no street address or full phone

---

## Sign-off

| Role | Name | Approved |
|------|------|----------|
| Product owner | | |
| Technical lead | | |
| QA | | |

**Notes:**

_______________________________________________

_______________________________________________
