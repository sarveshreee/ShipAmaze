# Partner API Operational Runbook

## Production checklist

### Before enabling Partner API

- [ ] MongoDB available and `MONGODB_URI` configured (Atlas replica set for wallet transactions).
- [ ] Confirm Atlas indexes exist (see Production indexes below).
- [ ] `PARTNER_API_ENABLED=true` only when the API should be live.
- [ ] `PARTNER_WALLET_BILLING_ENABLED=true` when Lorrigo/Ekart partner shipments must debit the linked dropshipper wallet.
- [ ] `PARTNER_RATE_LIMIT_STORE=mongo` (required for multi-instance / EC2; never `memory` in production).
- [ ] `PARTNER_RATE_LIMIT_PASS_ON_STORE_ERROR=true` (default) unless you explicitly accept fail-closed on store errors.
- [ ] Partner `linkedUserId` is a dropshipper with wallet balance (for billed providers).
- [ ] Lorrigo pickups synced when using `provider: lorrigo`.
- [ ] API key created with correct scopes (`shipments:create`, `shipments:read`, etc.).
- [ ] Monitoring for `[partner-api]`, `[partner-rate-limit-store]`, `[partner:booking]`, `[shipment-wallet]`.
- [ ] CI uses `MONGODB_URI_TEST` so integration tests (security + idempotency) run in pipeline.

### Production indexes (confirm in Atlas)

| Collection | Index | Options |
|------------|--------|---------|
| `orders` | `partnerId_1_partnerReferenceId_1` | unique + sparse |
| `partneridempotencyrecords` | `partnerId_1_idempotencyKey_1` | unique |
| `partneridempotencyrecords` | `expiresAt_1` | TTL `expireAfterSeconds: 0` |
| `transactions` | `userId_1_referenceType_1_referenceId_1` | unique + partial (non-empty `referenceId`) |
| `partner_rate_limit_counters` | `expiresAt_1` | TTL `expireAfterSeconds: 0` |

Mongoose may create indexes on connect; **still confirm** these exist in Atlas before enabling live partners.

### Required production env (summary)

```env
PARTNER_API_ENABLED=true
PARTNER_WALLET_BILLING_ENABLED=true
PARTNER_RATE_LIMIT_STORE=mongo
PARTNER_RATE_LIMIT_PASS_ON_STORE_ERROR=true
```

Defaults: `PARTNER_API_ENABLED` defaults to enabled; wallet billing defaults to **false** — set explicitly in production.

### Emergency actions

| Action | How |
|--------|-----|
| Kill switch (stop Partner API) | Set `PARTNER_API_ENABLED=false` and restart/redeploy — `/api/partner/v1` returns 503 |
| Suspend partner | Admin UI or `PATCH /api/admin/partners/:id/status` → `SUSPENDED` |
| Disable partner | Same → `DISABLED` |
| Revoke API key | Admin partner keys UI or revoke API |
| `walletDebitPending` | See WALLET_DEBIT_PENDING section; check `[wallet:debit-reconcile]` |
| `BOOKING_UNCERTAIN` | Do not delete order; partner polls GET shipment; see below |
| Orphan / stuck shipment | See Orphan section; check idempotency + order state |
| Rate-limit store errors | Search `[partner-rate-limit-store]`; verify Mongo connectivity; counters in `partner_rate_limit_counters` |

Do not log or share raw API keys (`sk_live_*`) in tickets or runbooks.

## WALLET_DEBIT_PENDING

### Symptoms

- Order has AWB / `shipmentCreated`
- `walletDebitPending: true` on the Order document
- Log line: `[shipment-wallet] WALLET_DEBIT_PENDING orderId=...`

### What happens automatically

Every ~3 minutes the server runs `reconcilePendingWalletDebits` under sync lock `wallet:debit-reconcile`. It scans orders with `walletDebitPending: true` and attempts idempotent debit via `shipment:{orderId}`.

### Manual investigation

1. Confirm `PARTNER_WALLET_BILLING_ENABLED=true`.
2. Confirm order `dropshipperId` is set (linked user must be dropshipper).
3. Check linked user wallet balance.
4. Inspect `Transaction` for `referenceType: shipment`, `referenceId: shipment:{orderId}`.
5. If debit succeeded but flag stuck, verify reconciliation job logs: `[wallet:debit-reconcile]`.

### Do not

- Manually debit without using the existing wallet ledger APIs.
- Delete the order to “fix” billing — debit is keyed by `orderId`.

## Orphan / pending partner orders

### Symptoms

- Partner reports `referenceId` conflict or booking stuck
- Order exists with `partnerReferenceId` but no AWB
- Idempotency record `PENDING` or missing `COMPLETED`

### Investigation

1. Find order: `{ partnerId, partnerReferenceId }`.
2. Check `bookingInProgress`, `bookingReconciliationRequired`, `awb`, `shipmentCreated`.
3. Check `PartnerIdempotencyRecord` for `{ partnerId, idempotencyKey }`.
4. Check provider events on the order document.

### Recovery

- **Booked with AWB:** Partner can retry same `Idempotency-Key` — API reconstructs success.
- **Unbooked, clear failure:** Reference may be released (`partnerReferenceArchived` set); partner retries same or new key.
- **BOOKING_UNCERTAIN:** Do not delete order or reference. Use provider reconciliation or support tools; partner polls GET shipment.

### Do not

- Delete `partnerReferenceId` without understanding booking state.
- Delete idempotency records while partner may retry the same key.
- Create a second order with the same `referenceId` manually.

## BOOKING_UNCERTAIN

Provider may have accepted the booking but HTTP timed out.

1. Check order for partial provider IDs / events.
2. Partner should poll `GET /shipments/:referenceId`.
3. Partner may retry **same** idempotency key — system resumes existing order.
4. Do not advise partners to use a **new** idempotency key for uncertain states.

## Partner suspension

Use admin UI or `PATCH /api/admin/partners/:id/status` with `SUSPENDED` or `DISABLED`. Keys stop working immediately. Reactivate with `ACTIVE`.

## Distributed rate limiting

Partner API rate limits are stored in MongoDB (`partner_rate_limit_counters`), so counters are **shared across all backend instances** (EC2 / horizontal scale).

- Limits are environment-driven (`PARTNER_GENERAL_RATE_LIMIT_MAX`, `PARTNER_BOOKING_RATE_LIMIT_MAX`, `PARTNER_AUTH_FAILURE_RATE_LIMIT_MAX`, and matching window vars).
- Bucket documents expire automatically via TTL on `expiresAt`.
- Clients should honor HTTP `429` responses and `Retry-After` / rate-limit headers.
- If Mongo rate-limit storage is temporarily unavailable, the API **fail-opens** by default (`PARTNER_RATE_LIMIT_PASS_ON_STORE_ERROR=true`) so Partner API availability is not blocked solely by rate-limit infrastructure. Failures are logged server-side.
- Production should use `PARTNER_RATE_LIMIT_STORE=mongo` (default outside `NODE_ENV=test`). Do not set `memory` in production.
- Per-partner `Partner.rateLimit` overrides are **not** enforced yet (deferred — see `docs/partner-api-limitations.md`).

## Partner audit logs

`PartnerAuditLog` records partner API requests (partnerId, endpoint, status, latency). There is **no TTL** on this collection today.

**Audit-log retention policy required before TTL/archival implementation.** Define retention with compliance/legal before enabling automatic deletion.

Indexes support lookup by `partnerId + createdAt`, `requestId`, `orderId`, and `endpoint`.

## Velocity Partner wallet

Partner Velocity bookings skip `PARTNER_WALLET_BILLING_ENABLED` and debit via `bookForwardShipmentForOrder` at booking time. Velocity status sync does not create AWB on unbooked orders and does not require the Lorrigo/Ekart `markWalletDebitPendingIfBookedWithoutDebit` hook.

## Logs to search

- `[partner:booking]`
- `[shipment-wallet] WALLET_DEBIT_PENDING`
- `[wallet:debit-reconcile]`
- `[lorrigo] booking`
- `[ekart] booking`
- `[partner-api]` / `[partner-rate-limit-store]`

## Controlled smoke test (test partner only)

Use a dedicated test partner, synthetic `referenceId` / `Idempotency-Key`, and no real customer data.

1. `GET /api/partner/v1/health` → 200
2. Invalid API key → 401
3. `POST /api/partner/v1/serviceability` → expected response
4. `POST /api/partner/v1/shipments` → 201 + AWB
5. Same request (same Idempotency-Key + body) → replay / no duplicate Order
6. `GET /api/partner/v1/shipments/:referenceId` → correct shipment
7. Track endpoint → expected provider state
8. Wallet: exactly one `Transaction` with `referenceId: shipment:{orderId}` (Atlas replica set required)
9. `PartnerAuditLog` row with `requestId` / `correlationId` from create response
10. `partner_rate_limit_counters` booking bucket keyed by partner id (never raw API key)

Rollback: set `PARTNER_API_ENABLED=false` and restart.
