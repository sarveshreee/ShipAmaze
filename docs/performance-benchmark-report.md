# Performance Benchmark Report

Status: **baseline methodology + engineering targets** (not a load-test certification).  
Date: 2026-07-25

## What was measured in-repo

| Area | Evidence | Observation |
|------|----------|-------------|
| Unit tests (courier) | Vitest suite Phase 4–7 | Discovery / booking / status / NDR unit paths typically &lt; 1s per file; booking suite ~3s with retries |
| Backend `tsc` build | `npm run build` | ~50s on Windows laptop (cold) |
| Frontend Vite build | `npm run build` | ~65s; chunks split (react/ui/charts/documents) |
| Provider HTTP timeout | config defaults | 45s AbortController |
| Status sync batch | `server.ts` | Velocity 150 / Lorrigo 100 orders per tick |
| NDR poll interval | defaults | 10 minutes |
| Serviceability cache | default TTL 60s | In-memory; failures never cached |
| Timeline caps | `providerEvents` 100, `statusHistory` 50 | Bounds memory growth per order |

## Target SLOs (production)

| Metric | Target | Alert if |
|--------|--------|----------|
| API p95 (non-provider) | &lt; 500 ms | &gt; 1.5 s for 10 min |
| Booking p95 (incl. provider) | &lt; 8 s | &gt; 20 s |
| Track sync batch duration | &lt; 4 min for batch 150 | Overlaps next interval |
| NDR sync duration | &lt; 2 min | Overlaps next interval |
| Discovery p95 (cached) | &lt; 200 ms | — |
| Discovery p95 (cold, both) | &lt; 3 s | &gt; 8 s |
| Error rate booking | &lt; 2% | Spike vs baseline |
| Mongo pool wait | near 0 | rising wait queue |

## Known bottlenecks (from Phase 8 audit)

1. **Velocity status sync N+1** — track + EDD `listShipments` per order → up to ~300 provider calls / batch.
2. **No sync mutex** — slow ticks can overlap.
3. **HTTP retries on POST** — amplify latency under 503s.
4. **Unbounded serviceability cache keys** — long-lived process memory risk.

## Recommended load-test plan (pre-go-live)

1. **k6 / Artillery** against staging with sandbox provider creds.
2. Scenarios:
   - 50 concurrent discovery requests (mode=both)
   - 10 concurrent Lorrigo bookings (unique orders)
   - 1 admin NDR sync while 20 users list `/ndr`
3. Capture: p50/p95 latency, provider error rate, Mongo CPU, Node heap.
4. Re-run after fixing Critical/High audit items.

## Build / bundle notes

- Frontend: route-level `React.lazy`; Vite `manualChunks` for react, UI, charts, documents.
- Keep NDR pages free of PDF/label heavy imports.
- Sourcemaps disabled in production Vite build.

## Conclusion

Codebase is architecturally ready for multi-provider traffic shaping, but **do not treat this report as a pass** until staging load tests clear the SLOs above and Phase 8 Critical/High fixes land.
