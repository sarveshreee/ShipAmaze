# Operations Runbook — Couriers

## Daily health checks

1. `GET /health` and `GET /api/health` — process up.
2. Admin: `GET /api/lorrigo/health` — auth probe + sync failure streak.
3. Admin: `GET /api/courier/ndr-metrics` and `/booking-metrics`.
4. Logs: search `[lorrigo:bg-sync]`, `[velocity:bg-sync]`, `[lorrigo:ndr-bg-sync]`, `[CRITICAL]`.

## Common incidents

### Lorrigo auth failing

Symptoms: pickup sync `failed`, booking 401/503, health `healthy: false`.  
Actions:

1. Confirm `LORRIGO_ENABLED`, email/password in secrets store.
2. Hit `/api/lorrigo/status` (admin) — check latency / consecutive failures.
3. Toggle off `LORRIGO_DEBUG_LOGS` if accidentally enabled (noise / risk).
4. Temporary kill switch: set `LORRIGO_ENABLED=false` and redeploy.

### Bookings succeed at provider but missing in UI

Symptoms: `[CRITICAL] Lorrigo booking succeeded but Mongo save failed`, `bookingReconciliationRequired`.  
Actions:

1. Find order by `correlationId` / `lorrigoOrderId` in logs.
2. Call provider get-shipment / admin reconcile path.
3. Manually set AWB + clear reconciliation flag only after verification.

### NDR stuck / duplicates

1. Manual `POST /api/courier/sync-ndr` `{ "daysBack": 30 }`.
2. Check `lastNdrFingerprint` and `providerEvents` for `NDR_RECEIVED`.
3. Metrics: `duplicateSuppressions` should rise on re-sync, not new rows.

### Status not updating

1. Confirm AWB present and status not terminal.
2. Check `lastProviderStatusSyncedAt` / `lastVelocityStatusSyncedAt` advancing.
3. Reduce load: temporary smaller batch via code/env if added; watch provider rate limits.

## Feature flags in production

| Flag | Safe rollback use |
|------|-------------------|
| `LORRIGO_ENABLED=false` | Stops Lorrigo registration + sync |
| `COURIER_DISCOVERY_MODE=velocity` | Hide Lorrigo from rates UI |
| `VELOCITY_ENABLED` | Does **not** fully stop Velocity sync if creds exist — see rollback guide |

## Never do in production

- Enable `*_DEBUG_LOGS` long-term.
- Replay booking POSTs without reconciliation.
- Delete `providerEvents` to “clean” history.
- Force-push over release tags without rollback plan.
