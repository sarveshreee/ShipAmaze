# ShipAmaze Courier Platform — k6 Load Tests

Load tests for booking, tracking sync, NDR actions, retries, and provider-timeout behaviour.

**These scripts do not modify application code.** They exercise a running API (staging recommended).

## Prerequisites

1. [k6](https://k6.io/docs/get-started/installation/) installed (`k6 version`)
2. Staging (or local) API URL
3. JWT for a test user that can book / NDR
4. Seeded test order IDs / AWBs (see env vars below)

> Do **not** run the full 1,000 concurrent booking scenario against production.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | Yes | API base, e.g. `https://staging-api.example.com` or `http://localhost:5000` |
| `AUTH_TOKEN` | Yes | Bearer JWT |
| `ORDER_IDS` | Booking scenarios | Comma-separated unused `orderId` values |
| `PICKUP_ID` | Booking | Pickup address ObjectId with Lorrigo sync |
| `COURIER_ID` | Booking | Lorrigo courier id |
| `AWBS` | Tracking / NDR | Comma-separated AWBs |
| `PROVIDER` | Optional | `lorrigo` (default) |

```bash
export BASE_URL=http://localhost:5000
export AUTH_TOKEN=eyJ...
export ORDER_IDS=ORD-LT-1,ORD-LT-2,...   # need enough unique IDs for VUs
export PICKUP_ID=507f1f77bcf86cd799439011
export COURIER_ID=your-carrier-id
export AWBS=AWB1,AWB2,AWB3
```

## Scenarios

| Script | Intent | Default intensity |
|--------|--------|-------------------|
| `booking_concurrent.js` | Concurrent bookings | 1,000 VUs |
| `tracking_sync.js` | Tracking / status sync pressure | 5,000 iterations |
| `ndr_actions.js` | Concurrent NDR actions | 500 VUs |
| `booking_retries.js` | Client retry storm after 429/5xx | 200 VUs |
| `provider_timeouts.js` | Slow/timeout tolerance | 100 VUs, high timeout |

## How to run

```bash
cd load-tests/k6

# Smoke (low VU) — always start here
k6 run --env BASE_URL=$BASE_URL --env AUTH_TOKEN=$AUTH_TOKEN \
  --env ORDER_IDS=$ORDER_IDS --env PICKUP_ID=$PICKUP_ID --env COURIER_ID=$COURIER_ID \
  -e SMOKE=1 booking_concurrent.js

# Full booking soak (staging only)
k6 run --env BASE_URL=$BASE_URL --env AUTH_TOKEN=$AUTH_TOKEN \
  --env ORDER_IDS=$ORDER_IDS --env PICKUP_ID=$PICKUP_ID --env COURIER_ID=$COURIER_ID \
  booking_concurrent.js

k6 run --env BASE_URL=$BASE_URL --env AUTH_TOKEN=$AUTH_TOKEN --env AWBS=$AWBS tracking_sync.js
k6 run --env BASE_URL=$BASE_URL --env AUTH_TOKEN=$AUTH_TOKEN --env AWBS=$AWBS ndr_actions.js
k6 run --env BASE_URL=$BASE_URL --env AUTH_TOKEN=$AUTH_TOKEN \
  --env ORDER_IDS=$ORDER_IDS --env PICKUP_ID=$PICKUP_ID --env COURIER_ID=$COURIER_ID \
  booking_retries.js
k6 run --env BASE_URL=$BASE_URL --env AUTH_TOKEN=$AUTH_TOKEN provider_timeouts.js
```

## Expected metrics

| Metric | Meaning |
|--------|---------|
| `http_req_duration` | End-to-end latency (p95 / p99) |
| `http_req_failed` | Transport + non-2xx/3xx rate |
| `bookings_ok` | Custom: successful bookings |
| `bookings_rate_limited` | Custom: HTTP 429 |
| `bookings_conflict` | Custom: HTTP 409 (duplicate / in progress) |
| `ndr_ok` / `ndr_fail` | Custom NDR counters |
| `sync_ok` | Custom status/NDR sync OK |

## Pass / fail thresholds

Defined in each script `options.thresholds`. Defaults:

| Check | Threshold |
|-------|-----------|
| `http_req_failed` | `< 5%` (booking); `< 10%` (sync storms) |
| `http_req_duration` p95 | `< 8s` booking; `< 5s` sync/NDR |
| `bookings_ok` rate | Not required to be 100% (rate limits / conflicts expected under load) |
| `bookings_rate_limited` | Informational — 429s prove limiter works |
| Checks | `checks` rate `> 90%` for smoke; `> 80%` for full |

Under intentional retry storms, `http_req_failed` may exceed 5% — that script uses looser thresholds.

## Interpreting results

- **Many 429s on booking** → rate limiter working (`RATE_LIMIT_COURIER_BOOKING_*`).
- **Many 409s** → atomic booking claim / idempotency working.
- **p95 > 8s** → provider latency or Mongo pool saturation; reduce VUs or batch size.
- **Sync overlapping skips** → check API logs for `[distributed-lock] skip` / `[sync-mutex] skip`.

## Safety

- Prefer staging with sandbox provider credentials.
- Cap `ORDER_IDS` uniqueness — reusing the same order produces 409s (useful for idempotency tests, useless for throughput).
- Provider timeout scenario uses a short client timeout against a normally slow path; it should not create thousands of live shipments.
