# Partner API Idempotency

## Requirement

`POST /shipments` requires:

```
Idempotency-Key: <unique-per-logical-booking>
```

Request bodies are fingerprinted using **canonical JSON** (stable key ordering) after Zod validation, so logically identical payloads with different key order are treated as the same request.

## Behavior by record status

| Status | Same key + same body | Behavior |
|--------|----------------------|----------|
| **COMPLETED** | Yes | Replay cached successful response (no new order, no provider call) |
| **PENDING** (&lt; 10 min) | Yes | If an existing partner order exists for `referenceId`, resume booking on that order; otherwise `409 IDEMPOTENCY_IN_PROGRESS` |
| **PENDING** (stale &gt; 10 min) | Yes | Stale record removed; lookup existing order by `partnerId + referenceId` and resume/recover instead of creating a duplicate order |
| **FAILED** | Yes | If `partnerReferenceId` was released (no active order for reference), allow a new attempt with the same key; if an unbooked order still exists, resume booking on it |
| **UNCERTAIN** | Yes | Recover against the existing order — do not create a new order or blindly recreate at the courier |
| Same key + different body | — | `409 IDEMPOTENCY_CONFLICT` |

Records expire after **24 hours** (Mongo TTL on `expiresAt`).

## Lost HTTP response recovery

If the courier booking succeeds and the order is persisted with an AWB, but the handler crashes before `completePartnerIdempotency(COMPLETED)`:

1. Retry with the **same** `Idempotency-Key` and same body.
2. ShipAmaze finds the existing order by `referenceId`, reconstructs the successful shipment response, and completes the idempotency record.
3. No duplicate ShipAmaze order and no duplicate courier booking.

## Booking safety

ShipAmaze also uses internal order booking claims and provider reconciliation. On provider timeout:

- Do **not** blindly retry with a **new** idempotency key
- Poll `GET /shipments/:referenceId`
- If `BOOKING_UNCERTAIN`, contact support or wait for reconciliation

## Internal key mapping

Partner header keys map to order claim keys as:

```
partner:{partnerId}:{Idempotency-Key}
```

## Retry guidance for integrators

| Situation | Recommended action |
|-----------|-------------------|
| Clear booking failure (`FAILED`, reference released) | Same or new `Idempotency-Key` with same `referenceId` |
| `BOOKING_UNCERTAIN` | Same key + same body to recover; poll GET shipment; do not use a new key |
| Timeout / unknown | Same key + same body first; then GET shipment by `referenceId` |
| `IDEMPOTENCY_CONFLICT` | Fix request body or use a new key |
