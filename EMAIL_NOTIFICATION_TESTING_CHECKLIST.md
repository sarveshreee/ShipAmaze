# Email & notification testing checklist (ShipAmaze)

Configure `backend/.env` with **`EMAIL_FROM` + `EMAIL_PASS`** (Gmail + App Password), or `GMAIL_USER` + `GMAIL_APP_PASSWORD`, or custom `SMTP_*`. Never commit secrets.

## Auth & verification

- [ ] **Signup sends OTP email** — Register a new user; inbox receives “Verify your ShipAmaze email” with 6-digit code (HTML + layout).
- [ ] **Cannot login before verification** — Login with correct password returns 403 and message “Please verify your email before logging in.”
- [ ] **Wrong OTP** — `POST /api/auth/verify-email-otp` with bad code returns error; attempts increment.
- [ ] **Expired OTP** — Wait past `EMAIL_VERIFICATION_OTP_MINUTES` (or shorten in env); verify fails with invalid/expired.
- [ ] **Resend OTP** — `POST /api/auth/resend-email-otp` with rate limit; new code works; old code invalidated after resend (stored hash replaced).
- [ ] **Successful verify** — Returns JWT + user; welcome email “Welcome to ShipAmaze”; security email “Your email was verified”.
- [ ] **Register response** — No `token` until verified; no OTP in JSON body.

## Forgot password

- [ ] **Forgot password** — Generic success message; branded “Reset your ShipAmaze password” email when SMTP configured.
- [ ] **Reset with OTP** — Valid OTP sets password; too many wrong OTPs blocks with 429 (see `PASSWORD_RESET_MAX_ATTEMPTS`).
- [ ] **Enumeration** — Unknown email still returns same forgot-password message.

## Orders & tracking

- [ ] **Order created email** — Create a non-draft order; owner receives “Order created successfully” with order summary and CTA.
- [ ] **No email for draft-only create** — Save as draft only; no “order created” mail (or confirm expected product behavior).
- [ ] **Status update email** — Move order through: ready_to_ship → pickup_scheduled → in_transit → delivered (or subset); each meaningful change sends “Tracking update…”; **same status re-saved** does not duplicate mail.
- [ ] **Bulk move to ready** — `bulk-move` uses `updateMany`; confirm tracking email still fires for affected orders.
- [ ] **Shipment / AWB** — When AWB (or tracking id) is first assigned (e.g. process-selected or Velocity); “Shipment created — AWB …” with track CTA.

## Wallet

- [ ] **Manual / test recharge** — Vendor/dropshipper `POST /wallet/add-balance`; “Wallet credited” email.
- [ ] **Admin adjustment** — Admin PATCH wallet adjust credit/debit; wallet email with correct sign.
- [ ] **Admin deduct** — Debit email with reason/reference.
- [ ] **Shipment wallet debit** — When shipping charge debits wallet (Velocity path); debit email (may arrive near shipment-created mail).

## Shopify & profile

- [ ] **Shopify sync summary** — After `POST /api/shopify/sync-orders` with orders returned, optional summary email with counts.
- [ ] **Profile updated** — `PATCH /auth/profile` (or PUT users/profile) sends security notice.
- [ ] **Password changed** — Authenticated change-password sends security notice.

## Layout & safety

- [ ] **Mobile HTML** — Open a few templates on a phone mail client; logo, card, CTA readable.
- [ ] **SMTP failure** — Misconfigure password temporarily; API flows (register, verify, wallet) still succeed; server logs safe error (no OTP/password).
- [ ] **No sensitive data in email** — No password hash, JWT, internal Mongo `_id`, or app secrets in body.
- [ ] **Production logs** — With `NODE_ENV=production`, confirm OTPs are not logged when SMTP is missing.

## Regression

- [ ] **Legacy users** — Accounts without `emailVerified` field still log in.
- [ ] **Seed users** — `emailVerified: true` seed accounts log in without verify step.
