# ShipAmaze — Owner Handover Guide

This document is for the business owner or operations lead running ShipAmaze in production.

---

## What ShipAmaze is

ShipAmaze is a multi-role shipping and order operations platform:

- **Dropshippers** import/sync orders, book shipments (Velocity), print labels, track deliveries, manage wallet balance.
- **Vendors** manage catalogue, warehouses, and fulfilment-related data.
- **Admins** oversee users, finance, courier rules, Shopify connections, reports, and platform settings.

---

## URLs (replace with your domains)

| Purpose | Typical URL |
|---------|-------------|
| Application login | `https://app.yourdomain.com/login` |
| Public tracking (customers) | `https://app.yourdomain.com/track` |
| API health | `https://api.yourdomain.com/health` |

---

## Admin access

**Admin accounts are not created via public signup.**

Create the first admin using the server seed script (one-time):

```bash
cd backend
npm run seed:users
```

Default seed credentials are defined in `backend/src/scripts/seedUsers.ts` (e.g. `admin@admin.com`). **Change the password immediately** after first login via **Admin → Change Password**.

Additional admins should be created by your technical team in the database or extended admin tooling — not through the public registration form.

---

## User roles

| Role | Purpose |
|------|---------|
| **Admin** | Full platform: all orders, users, wallets, settings, courier priority, reports |
| **Vendor** | Own products, warehouses, vendor orders, team |
| **Dropshipper** | Orders, Shopify channels, pickups, wallet, shipments |

Dropshippers may be **FULL** or **RESTRICTED** (limited warehouse/vendor/order processing). Admins configure this under **Admin → Dropshippers**.

---

## Core features

### Orders

- Tabs: All, Channel (Shopify), Manual, Ready to Ship, In Transit, Delivered, Junk, etc.
- Bulk move to Ready to Ship, process selected (admin), junk orders.
- Order detail drawer: line items, shipment, labels, tracking.

### Labels & invoices

- **Admin → Settings → Label & Invoice**: company name, logo, barcode, COD display, label size (4×6, A6, A5).
- Print/download label and invoice PDF from order UI (client-side generation).
- Public label branding uses safe public settings endpoint (no auth) for tracking pages only.

### Tracking

- **In-app:** Dropshipper → Track Shipment (or `/track` when embedded).
- **Public:** `/track` — search by AWB or order ID (masked phone, city/state only — no full address exposed).
- Velocity integration provides live courier tracking when AWB exists.

### Wallet

- Dropshipper/vendor wallets hold balance for shipping charges.
- **Production:** users cannot self-credit; admins adjust via **Admin → Finance** or wallet APIs.
- Transaction history visible per user.

### Shopify

- Dropshipper connects store: **Channels** → enter `store.myshopify.com` → OAuth.
- Orders sync via webhooks (`orders/create`, `orders/updated`, `orders/cancelled`) and manual sync.
- Disconnect revokes tokens; uninstall webhook deactivates connection.

### Velocity (courier)

- When enabled, forward/reverse shipments, rates, serviceability, and AWB assignment go through Velocity API.
- Warehouses/pickup addresses must be linked to Velocity warehouse IDs where required.

### Vendors & warehouses

- Vendors maintain catalogue and warehouse records.
- Dropshippers (with permission) can access vendor/warehouse lists for routing.
- Pickup addresses used when processing shipments.

### Permissions

- **Admin → Permissions:** enable/disable tabs per dropshipper or vendor user.

### Support

- Users create support tickets; admins respond under **Admin → Support**.

---

## How to add users

| Type | How |
|------|-----|
| Vendor / Dropshipper | Self-service at `/signup` (email verification required) |
| Admin | Seed script or database — not public signup |
| Team members | Vendor/dropshipper **Settings → Team** (invites sub-users) |

---

## Day-to-day operations (admin)

1. Monitor **Admin → Orders** for stuck or failed shipments.
2. Review **NDR / Returns** as needed.
3. Adjust wallets for prepaid customers (**Admin → Finance**).
4. Update **Courier priority rules** when changing default carriers.
5. Check **Reports** for volume and billing summaries.
6. Keep **Label settings** logo and return address current.

---

## Troubleshooting basics

| Issue | What to check |
|-------|----------------|
| Cannot login | Email verified? Account active/not blocked? |
| API errors in UI | `VITE_API_BASE_URL` correct? API `/health` up? |
| CORS errors | `CORS_ORIGIN` on API matches frontend URL exactly |
| Shopify won't connect | Redirect URI in Partners matches production callback URL |
| No emails (OTP) | `EMAIL_FROM` / SMTP configured on API |
| Shipment fails | Velocity credentials, wallet balance, pickup address linked |
| Label blank/wrong | Admin label settings; order has AWB |
| Public track shows little info | By design — PII masked; use AWB for Velocity timeline |

**Logs (technical):**

- Render: service logs dashboard
- PM2: `pm2 logs shipamaze-api`
- Look for `[audit]` lines for blocked wallet self-credit attempts

---

## Security notes for owners

- Never share `JWT_SECRET`, `ENCRYPTION_SECRET`, or Shopify secret.
- Rotate secrets if staff with access leaves.
- Admin registration via public API is blocked in production builds.
- Review admin user list periodically.

---

## Support contacts

Document your internal technical contact and hosting accounts (Vercel, Render, Atlas) in your runbook — not in this repo.

---

## Related files

- `PRODUCTION_DEPLOYMENT_GUIDE.md` — deploy steps
- `FINAL_QA_CHECKLIST.md` — testing before go-live
- `PRODUCTION_RELEASE_CHECKLIST.md` — technical release checklist
