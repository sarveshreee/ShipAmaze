# Changelog — Multi-Provider Courier (Velocity + Lorrigo)

Summarizes the ShipAmaze courier integration work from shared provider architecture through production hardening and load tests.

**Branch tip (as of this doc):** `af5229e`  
**Related docs:** [`docs/multi-provider-architecture.md`](./docs/multi-provider-architecture.md), [`docs/phase8-production-audit.md`](./docs/phase8-production-audit.md), [`docs/distributed-locking.md`](./docs/distributed-locking.md), [`load-tests/k6/README.md`](./load-tests/k6/README.md)

---

## Pre-production checklist (practical)

Before production rollout:

1. **Deploy to staging** with production-like env (flags, Mongo pool, timeouts, credentials).
2. **Run k6** (`load-tests/k6`) and monitor CPU, memory, Mongo connections, Redis (if used), latency, error rates.
3. **Manual E2E**
   - Velocity booking  
   - Lorrigo booking  
   - Tracking / status updates  
   - Pickup sync (Lorrigo + Velocity warehouse link)  
   - NDR sync + actions  
   - Feature flags: `VELOCITY_ENABLED`, `LORRIGO_ENABLED`
4. **Rollback without redeploy** — toggle `VELOCITY_ENABLED=false` / `LORRIGO_ENABLED=false` and confirm kill switches.
5. **First prod window** — watch logs for unexpected provider bodies, uncertain bookings, retry/429 spikes, `[distributed-lock] skip`, `[CRITICAL]` reconciliation.

---

## Phase 1 – Provider Architecture

**Commit:** `e112bcd`  
**Checkpoint:** `598b99f`

### Goal
Introduce a shared `CourierProvider` contract and registry so Velocity is an adapter, not a hard-coded monolith. Prepare Lorrigo without breaking existing Velocity paths.

### Delivered
- `backend/src/modules/courier/` — interface, registry, shared HTTP client, sanitization
- Velocity wrapped as `velocityCourierProvider`
- Controllers/services resolve providers via registry for shared flows

### Notes
Velocity forward-create path kept as the legacy booking entry for Velocity.

---

## Phase 2 – Authentication

**Commits:** `dddc3be`, `fa8ec69`  
**Checkpoints:** `5027155`, `be38bf4`

### Goal
Lorrigo login + token cache behind `LORRIGO_ENABLED`, with safe status/health endpoints.

### Delivered
- Lorrigo client auth, token TTL cache, 401 refresh
- `GET /api/lorrigo/status` and `/health` (admin)
- Auth latency, request IDs, retry counts on status (no secrets in logs)
- Feature flag: credentials required in production when Lorrigo enabled

---

## Phase 3 – Pickup Sync

**Commit:** `c77619d`  
**Checkpoint:** `50f944c`

### Goal
Auto-sync local pickup addresses to Lorrigo; local pickup always wins on sync failure.

### Delivered
- Pickup → Lorrigo warehouse/pickup sync with retry API
- Optional fields: `lorrigoPickupId`, `lorrigoSyncStatus`, …
- UI badge / retry for failed sync
- Idempotent sync behavior

---

## Phase 4 – Serviceability

**Commit:** `96e3268`  
**Checkpoint:** `fdea4b0`

### Goal
Multi-provider serviceability and rates discovery with normalization and caching.

### Delivered
- `POST /api/courier/serviceability` and `/rates`
- `COURIER_DISCOVERY_MODE` = `velocity` | `lorrigo` | `both`
- Normalized courier options + discovery metrics
- Optional in-memory success cache (failures never cached)

---

## Phase 5 – Booking + Capabilities

**Commit:** `cbfe856`  
**Checkpoint:** `15c7b99`

### Goal
Capability registry + Lorrigo one-click booking via orchestrator; Velocity booking unchanged.

### Delivered
- Static capabilities (`booking`, `tracking`, `ndr`, …) backend + frontend mirror
- `POST /api/courier/shipments` → `bookLorrigoShipment`
- Process Selected supports `provider: "lorrigo"`
- Optional order fields: `courierProvider`, `lorrigoOrderId`, `lorrigoShipmentId`, reconciliation flag
- Booking metrics

---

## Phase 6 – Tracking + Timeline

**Commit:** `3a50a68`  
**Checkpoint:** `feb53f0`

### Goal
Lorrigo status polling and append-only provider event timeline for debugging.

### Delivered
- `providerEvents[]`, `correlationId`, `bookingVersion`
- Lorrigo background status sync (`LORRIGO_STATUS_SYNC_INTERVAL_MS`)
- Event types: `BOOKING_*`, `TRACKING_*`, `STATUS_CHANGE`, `CANCEL_*`, `RECONCILIATION`
- Fair rotation via `lastProviderStatusSyncedAt`

---

## Phase 7 – NDR

**Commit:** `b2b4f62`

### Goal
Provider-agnostic NDR: fetch → normalize → upsert → actions → existing NDR UI.

### Delivered
- Contract: `supportsNDR` / `fetchNDR` / `performNDRAction` / `syncNDR`
- Lorrigo NDR fetch/action + sync with fingerprint duplicate suppression
- Timeline: `NDR_RECEIVED` → `NDR_ACTION` → `NDR_RESOLVED`
- Background NDR poll (`LORRIGO_NDR_SYNC_INTERVAL_MS`)
- `POST /api/courier/sync-ndr`, `GET /api/courier/ndr-metrics`
- Admin/Dropshipper NDR pages made provider-aware (no redesign)
- Actions: reattempt, return/RTO, fake-attempt (Lorrigo only)

---

## Phase 8 – Production Audit

**Commit:** `7c35865`

### Goal
Full production-readiness audit + ops documentation (no code fixes in this phase).

### Delivered
- [`docs/phase8-production-audit.md`](./docs/phase8-production-audit.md) — Critical/High findings
- Architecture, ER, sequence diagrams
- Provider integration guide, onboarding, runbook, rollback, DR, performance baseline

### Top risks called out (later fixed in Phase 9 / Final)
- Raw provider errors to clients  
- Unsafe booking POST retries / double-create  
- Booking race, sync overlap, Velocity N+1, Mongo pool/indexes  

---

## Phase 9 – Hardening

**Commit:** `e94b36c`

### Goal
Implement Critical/High audit fixes for production stability.

### Delivered
- Sanitized client error shape (`provider`, `code`, `message`, `correlationId`, `retryable`)
- Idempotent Lorrigo booking + atomic claim (`bookingInProgress`)
- No blind POST retries; timeout → reconcile via `getShipment`
- Process-local sync mutex; Velocity sync N+1 reduced (batch load + conditional EDD)
- Mongo pool options + compound indexes
- Provider HTTP: exponential backoff, jitter, Retry-After, concurrency limits
- `GET /api/health/ready`; extended Lorrigo status metrics
- Regression tests for errors, claim, timeout reconcile, mutex

---

## Final – Feature Flags, Distributed Locks, Rate Limiting, Load Tests

**Commit:** `af5229e`

### Goal
Close remaining production risks and ship a repeatable load-test suite.

### Delivered

| Item | Detail |
|------|--------|
| **`VELOCITY_ENABLED` kill switch** | `false` → no register, sync, discovery, authenticated Velocity APIs, or new Velocity bookings. Unset defaults to **enabled** (backward compatible). |
| **Booking rate limit** | `POST /api/courier/shipments` — `RATE_LIMIT_COURIER_BOOKING_MAX` / `_WINDOW_MS`; HTTP 429 + Retry-After |
| **Distributed locks** | Process-local + Redis (`REDIS_URL` + optional `ioredis`) or Mongo `distributed_locks` — see [`docs/distributed-locking.md`](./docs/distributed-locking.md) |
| **k6 suite** | [`load-tests/k6/`](./load-tests/k6/) — 1k bookings, 5k tracking sync iters, 500 NDR actions, retries, timeouts |

### Env flags (quick reference)

| Flag | Effect |
|------|--------|
| `LORRIGO_ENABLED` | Register/use Lorrigo (opt-in) |
| `VELOCITY_ENABLED` | Kill switch; unset = on; `false` = fully off |
| `COURIER_DISCOVERY_MODE` | `velocity` \| `lorrigo` \| `both` |
| `REDIS_URL` | Optional distributed lock backend |
| `RATE_LIMIT_COURIER_BOOKING_*` | Booking endpoint limits |

---

## Commit index (courier phases)

| Phase | Commit |
|-------|--------|
| 1 Architecture | `e112bcd` |
| 2 Auth | `dddc3be`, `fa8ec69` |
| 3 Pickup | `c77619d` |
| 4 Serviceability | `96e3268` |
| 5 Booking | `cbfe856` |
| 6 Tracking | `3a50a68` |
| 7 NDR | `b2b4f62` |
| 8 Audit docs | `7c35865` |
| 9 Hardening | `e94b36c` |
| Final flags/locks/limits/k6 | `af5229e` |

---

## Design principles (unchanged across phases)

1. Controllers use the provider registry — not provider-specific branching for new work.
2. Prefer `capabilities` / `supportsNDR()` over `provider === "…"`.
3. Optional DB fields only; Velocity legacy paths stay backward compatible.
4. Local pickup/order state wins on sync failure.
5. Never log tokens, passwords, or raw auth bodies to clients.
6. Provider timelines are append-only.
