# Phase 8 — Production Audit

Audit date: 2026-07-25  
Scope: Multi-provider courier (Velocity + Lorrigo) on ShipAmaze MERN  
Branch state: after Phase 7 NDR (`b2b4f62`)

## Executive summary

ShipAmaze is close to multi-provider production readiness. Auth, capability gating, log redaction helpers, append-only provider timelines, and Lorrigo feature-flag kill-switch are solid.

**Block production** until the two Critical items below are fixed. Then address High items before heavy traffic.

## Severity rollup

| Severity | Count | Themes |
|----------|------:|--------|
| Critical | 2 | Raw provider errors to clients; booking retry may double-create |
| High | 8 | Sync N+1, pool options, rate limits, booking race, indexes, workers, POST retries, Velocity auth gaps |
| Medium | 10 | Flags, capabilities drift, health depth, cache growth, idempotency |
| Low / Info | 6 | unref OK, event caps, frontend chunks, dead helpers |

## Checklist results

### 1. Security — Critical / High

| Finding | Path | Recommendation |
|---------|------|----------------|
| `AppError.providerError` can leak raw Velocity/Lorrigo bodies to clients | `middleware/errorMiddleware.ts`, `courier/http/providerErrors.ts` | Never return raw provider payloads in production; return sanitized message + requestId |
| Lorrigo `alwaysLogRequests: true` logs every request | `lorrigo.client.ts` | Gate with env; default off in production |
| Velocity `/serviceability` and `/rates` lack `requireRoles` | `velocity.routes.ts` | Restrict to admin/vendor/dropshipper |
| Debug log flags must stay off in prod | `VELOCITY_DEBUG_LOGS`, `LORRIGO_DEBUG_LOGS` | Document in ops runbook |

### 2. Performance — High / Medium

| Finding | Path | Recommendation |
|---------|------|----------------|
| Velocity status sync: track + EDD per order (N+1) | `velocity.statusSync.ts` | Batch/skip EDD on poll; concurrency pool |
| Sync batch 150 may exceed interval under load | `server.ts` | Add in-flight mutex; tune batch by p95 |
| Serviceability cache Map unbounded | `serviceabilityCache.ts` | Cap with LRU |

### 3. Memory leak — Low / Info

| Finding | Path | Recommendation |
|---------|------|----------------|
| All `setInterval` / startup `setTimeout` call `.unref()` | `server.ts` | Keep for new jobs |
| `providerEvents` capped at 100 | `providerEvents.ts` | OK; optional Mongo `$slice` |
| Cache Map can grow with unique lanes | `serviceabilityCache.ts` | LRU |

### 4. Connection pool — High

| Finding | Path | Recommendation |
|---------|------|----------------|
| `mongoose.connect(uri)` with no pool options | `config/db.ts` | Set `maxPoolSize`, `serverSelectionTimeoutMS`, `maxIdleTimeMS` |

### 5. Retry — Critical / High

| Finding | Path | Recommendation |
|---------|------|----------------|
| HTTP client retries POST including booking | `providerHttpClient.ts` | Do not retry non-idempotent create-shipment |
| `bookLorrigoShipment` app-level retry after timeout | `bookShipment.ts` | Reconcile via `getShipment` before recreate |

### 6. Timeout — Info

| Finding | Path | Recommendation |
|---------|------|----------------|
| Default 45s AbortController timeouts | velocity/lorrigo configs | Keep; ensure batch × timeout ≪ sync interval |

### 7. Rate limit — High

| Finding | Path | Recommendation |
|---------|------|----------------|
| Auth/OTP/Shopify/public track limited; booking/discovery/NDR sync not | `middleware/rateLimits.ts`, courier routes | Add per-user/IP limiters on booking + sync-ndr |

### 8. Duplicate booking — High

| Finding | Path | Recommendation |
|---------|------|----------------|
| Check-then-act on `shipmentCreated` / AWB (TOCTOU) | `bookShipment.ts`, `velocity.controller.ts` | Atomic claim before provider call |

### 9. Idempotency — Medium

| Finding | Path | Recommendation |
|---------|------|----------------|
| Partial reconcile + `correlationId` / `bookingVersion`; no client Idempotency-Key | booking paths | Persist booking intent; accept Idempotency-Key |

### 10. Log sanitization — Medium

| Finding | Path | Recommendation |
|---------|------|----------------|
| Strong sanitizers exist; API error path bypasses them | `sanitizeForProviderLog.ts`, error middleware | Align client responses with sanitizer |

### 11. Feature flags — Medium

| Finding | Path | Recommendation |
|---------|------|----------------|
| `LORRIGO_ENABLED` is a real kill switch | `registerProviders.ts`, lorrigo modules | Keep |
| `VELOCITY_ENABLED` only forces prod cred validation; sync continues if creds present | `env.ts`, `server.ts` | Align kill-switch semantics or rename |

### 12. Provider capabilities — Medium

| Finding | Path | Recommendation |
|---------|------|----------------|
| Static maps duplicated FE/BE | `capabilities.ts`, `providerCapabilities.ts` | Prefer live `GET /api/courier/providers` |

### 13. Health endpoints — Medium

| Finding | Path | Recommendation |
|---------|------|----------------|
| `/health` is process-only | `app.ts` | Add `/api/health/ready` (Mongo + optional provider probes) |
| Lorrigo has rich admin health | `lorrigo.routes.ts` | Add Velocity mirror for ops |

### 14. Dead code — Low

| Finding | Path | Recommendation |
|---------|------|----------------|
| Unused `notImplemented` / unused export paths | `lorrigoCourierProvider.ts`, `bookShipment.ts` | Remove or wire |

### 15. Duplicate logic — Medium

| Finding | Path | Recommendation |
|---------|------|----------------|
| Terminal status sets differ across sync modules | velocity/lorrigo/NDR | Centralize in `statusNormalize` |

### 16. Bundle / build — Info

| Finding | Path | Recommendation |
|---------|------|----------------|
| Route lazy-load + Vite `manualChunks` | `App.tsx`, `vite.config.ts` | Keep; avoid eager PDF/chart imports on NDR |

### 17. Mongo indexes — High

| Finding | Path | Recommendation |
|---------|------|----------------|
| Missing compounds for status sync filters | `Order.ts` | `{ courierProvider, status, lastProviderStatusSyncedAt }` (+ Velocity equivalent) |
| NDR list missing `{ status, updatedAt }` | `NDR.ts` | Add compound |
| `velocityOrderId` sparse, no index | `Order.ts` | Add sparse index |

### 18. Background workers — High

| Finding | Path | Recommendation |
|---------|------|----------------|
| Multiple intervals, no overlap mutex | `server.ts` | `running` guards; stagger; consider external cron for multi-instance |

## Priority fix order

1. Stop returning raw `providerError` from `errorMiddleware`.
2. Make Lorrigo booking retries reconcile-only; disable HTTP retries for create-shipment POSTs.
3. Atomic booking claim on Order before provider call.
4. Fix Velocity status-sync N+1; add sync compound indexes.
5. Rate-limit booking/discovery; set mongoose pool options; add ready health check.
6. Align `VELOCITY_ENABLED` kill-switch; add sync overlap locks; cap serviceability cache.

## Related docs

- [Architecture (final)](./architecture-final.md)
- [ER diagram](./er-diagram.md)
- [Sequence diagrams](./sequence-diagrams.md)
- [Provider integration guide](./provider-integration-guide.md)
- [Developer onboarding](./developer-onboarding.md)
- [Operations runbook](./operations-runbook.md)
- [Rollback guide](./rollback-guide.md)
- [Disaster recovery](./disaster-recovery.md)
- [Performance benchmark report](./performance-benchmark-report.md)
