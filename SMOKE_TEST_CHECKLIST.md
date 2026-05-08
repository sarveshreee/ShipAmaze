# Smoke test checklist — ShipAmaze

Quick validation after deploy or before a demo. Mark **Pass / Fail** and note the environment (production / staging).

## Auth

- [ ] Register a new user (or use test account).
- [ ] Login returns JWT; refresh page stays logged in.
- [ ] Logout clears session client-side.
- [ ] Forgot password flow (if SMTP configured) or verify error handling if not.
- [ ] Change password while logged in.

## Pickup address

- [ ] List pickup addresses.
- [ ] Create / edit / set default address.
- [ ] Delete non-default address (if allowed).

## Order create

- [ ] Create single order (dropshipper or vendor flow as applicable).
- [ ] Order appears in list with expected status.
- [ ] Open order detail.

## Wallet

- [ ] View wallet balance and transaction list.
- [ ] Admin: wallet list / adjust (if applicable).
- [ ] No sensitive tokens in API responses (browser Network tab).

## Velocity shipment (if enabled)

- [ ] Serviceability or rates call succeeds for a test pincode.
- [ ] Create shipment / forward flow for a test order (non-production data preferred).
- [ ] Label or tracking reference returned as per provider.

## Tracking

- [ ] Public track by AWB (`/track` or equivalent).
- [ ] Public order by id if used.
- [ ] Authenticated tracking / Velocity track where configured.

## Shopify sync (if configured)

- [ ] Connect store OAuth completes and redirects to frontend.
- [ ] Status shows connected shop.
- [ ] Sync orders pulls or updates rows without duplicate errors.
- [ ] Webhook delivery idempotent (retry safe).

## Admin modules

- [ ] Admin dashboard loads.
- [ ] Catalogue / vendors / dropshippers / support tickets (as you use them).
- [ ] Permissions or tab settings if applicable.

## Reports / Billing

- [ ] Admin Reports: summary and orders table load from API.
- [ ] Filters and CSV export (scoped correctly by role).
- [ ] Billing: invoices list, detail, CSV export; no secrets in files.

## Cross-cutting

- [ ] Mobile width: main tables scroll or stack without broken layout.
- [ ] No console errors on happy-path navigation (F12).
- [ ] `GET /health` on API returns 200.

---

| Tester | Date | Environment | Result |
|--------|------|-------------|--------|
| | | | |
