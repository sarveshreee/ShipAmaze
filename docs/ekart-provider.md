# Ekart Provider (Phase 1–2)

Durin / Ekart Logistics integration as a first-class `CourierProvider` (`provider = "ekart"`).

## Feature flag

```
EKART_ENABLED=false
```

When false: not registered, no booking/tracking/polling/health/UI via registry.

## Authentication

1. `POST /auth/token` with:
   - `Authorization: Basic …` (`EKART_AUTHORIZATION`)
   - `HTTP_X_MERCHANT_CODE: TEC` (`EKART_MERCHANT_CODE`)
2. Response: `{ "Authorization": "Bearer <jwt>" }` (≈45 minutes).
3. All other calls use Bearer + merchant header via shared `providerHttpClient`.

Credentials are never logged (`sanitizeForProviderLog` masks authorization / merchant / client_name).

## Booking flow

```
ShipAmaze Pickup (canonical)
  → bookEkartShipment / POST /api/courier/shipments { provider: "ekart" }
  → map Pickup → Ekart source + return_location
  → POST /v2/shipments/create
  → store ids distinctly (see below)
```

**No** `syncPickupToEkart`, **no** provider pickup IDs.

Optional future: `Pickup.ekartLocationCode` → `source.location_code` when set; otherwise full address.

### Durin create ID fields (OpenAPI Non_Large v2)

Source: `https://api.ekartlogistics.com/api_docs/type/Non_Large/version/v2?format=yaml` — `ShipmentDetails` + create response examples.

**Request** (`services[].service_details[].shipment`):

| Field | Required | Docs meaning |
|-------|----------|--------------|
| `client_reference_id` | Yes (NotEmpty on large; used on non-large) | “Client’s reference id for the shipment. Can be same as tracking_id. Max allowed length is 15.” |
| `tracking_id` | Yes (NotEmpty) | “The tracking id of the shipment… uniquely identify the shipment for a client… format: 3-char merchant code + `C`/`P` (COD/PREPAID) + 10 unique digits.” |

**Response** (`ApiResponse` example on `POST /v2/shipments/create`):

| Field | Docs meaning |
|-------|--------------|
| `request_id` | Request correlation id (UUID in examples) |
| `response[].tracking_id` | Echoed tracking id (e.g. `MVKC0056134525`) |
| `response[].status` | `REQUEST_RECEIVED` / `REQUEST_REJECTED` |
| `response[].status_code` | e.g. `200` |
| `response[].shipment_payment_link` | Optional |
| `response[].is_parked` | Optional (`NOT_PARKED`, …) |
| `response[].message` | Rejection reasons |

Durin does **not** document a separate Ekart-generated AWB field on create. The AWB used downstream is `response[].tracking_id`. Later APIs also use `merchant_reference_id` (often equal to tracking_id in examples; RTO/RVP may take either).

### ShipAmaze storage (never overwrite)

| Concept | Durin field | Order field |
|---------|-------------|-------------|
| Merchant reference | request `client_reference_id` | `ekartClientReferenceId` |
| Shipment AWB | response `tracking_id` | `awb` + `ekartTrackingId` |
| Request id | response `request_id` | `ekartRequestId` |

Phase 1 allocates a Flipkart-format `tracking_id` for the request; AWB shown in ShipAmaze is always taken from the **response** `tracking_id`.

## Tracking flow (Phase 2)

```
POST /v2/shipments/track { tracking_ids: [awb] }
  → parse machine history[0].status (newest-first)
  → mapEkartStatusToProviderCanonical → Order.status
  → refresh trackingActivities from public_description
  → STATUS_CHANGE provider event only when status advances
  → duplicate same-status polls: bump lastProviderStatusSyncedAt only
```

Background poller (same scheduler pattern as Lorrigo/Velocity):

- `setInterval` + `withSyncLock("ekart:status")` in `server.ts`
- Polls only `courierProvider: "ekart"` with AWB, non-terminal status
- Interval: `EKART_STATUS_SYNC_INTERVAL_MS` (default 5 minutes)
- Startup sync ~50s after boot when enabled + configured

## Environment variables

| Variable | Default |
|----------|---------|
| `EKART_ENABLED` | `false` |
| `EKART_BASE_URL` | `https://api.ekartlogistics.com` |
| `EKART_AUTHORIZATION` | (required when enabled) |
| `EKART_MERCHANT_CODE` | (required when enabled) |
| `EKART_TIMEOUT_MS` | `30000` |
| `EKART_RETRY_COUNT` | `2` |
| `EKART_CREATE_ENDPOINT` | `/v2/shipments/create` |
| `EKART_TRACK_ENDPOINT` | `/v2/shipments/track` |
| `EKART_CREATE_LARGE_ENDPOINT` | `/shipments/large/create` |
| `EKART_TRACK_LARGE_ENDPOINT` | `/shipments/large/track` |
| `EKART_STATUS_SYNC_INTERVAL_MS` | `300000` |

## Capabilities (Phase 1–2)

| Capability | |
|------------|--|
| booking | true |
| tracking | true |
| background status sync | true |
| serviceability | true (`/v1/offerings`) |
| rates | false |
| pickupSync | false |
| createPickup | false (501) |
| cancel | false |
| ndr | false |
| returns | false |
| labels | false |
| webhooks | false |

## Health / metrics

`GET /api/ekart/health` (admin) reports:

- Authentication status + auth latency
- Booking / tracking success·failure·latency
- Status sync: active shipments, last poll, last successful poll, consecutive failures, provider latency, statusChanges

Also under courier booking metrics (`ekart` key).

## Limitations

- Large shipment endpoints configured but not used in booking.
- No PDF label API (Durin `get_label_information` is metadata only).
- No cancel/RTO/RVP yet.
- No reverse shipments yet.
- No freight rate API.
- Critical Updates webhooks not enrolled (polling covers active shipments).

## Rollback

Set `EKART_ENABLED=false` and restart. Existing Velocity/Lorrigo unchanged. Optional Order/Pickup fields remain unused.

## Phase 3 (planned)

- Cancel via RTO / Cancel RVP
- Reverse shipments
- Large shipment path
- Optional Critical Updates webhooks
- Label generation strategy (if product needs it)
