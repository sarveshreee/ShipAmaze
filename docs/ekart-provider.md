# Ekart Provider (Phase 1–3)

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

Optional: `Pickup.ekartLocationCode` → `source.location_code` when set (recommended for Elite warehouse views); otherwise full address.

### Pickup sync (Elite link — not API create)

Durin has **no** create-warehouse API. Locations are registered in Elite (Settings → Pickup locations) and approved by Ekart.

ShipAmaze **Sync to Ekart** = link that Elite `location_code` onto the pickup:

```
POST /api/ekart/pickups/:id/sync  { locationCode: "TEC_SUR_01" }
POST /api/ekart/pickups/:id/unlink
```

Booking requires a linked code (or `EKART_DEFAULT_LOCATION_CODE`). Without it, create still works on public tracking but Elite Shipments stays empty.

### Durin `service_code` (REGULAR / ECONOMY)

Discovery returns `courierId` values like `ekart:REGULAR` and `ekart:ECONOMY` from `POST /v1/offerings`.
Create shipment uses that selected code as Durin `services[].service_code` (not only `EKART_SERVICE_CODE`).

Single-order Create Shipment and Process Selected must send `provider: "ekart"` to `POST /api/courier/shipments` (never Velocity). Velocity’s own “Ekart” carrier is a different path and will **not** appear in Durin Elite.

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
| `EKART_RTO_CREATE_ENDPOINT` | `/v3/shipments/rto/create` |
| `EKART_CANCEL_RVP_ENDPOINT` | `/v3/shipments/cancel_rvp` |
| `EKART_REVERSE_SERVICE_CODE` | `RETURNS_SMART_CHECK` |
| `EKART_STATUS_SYNC_INTERVAL_MS` | `300000` |
| `EKART_WEBHOOKS_ENABLED` | `false` |
| `EKART_WEBHOOK_SECRET` | (optional) |
| `EKART_CANCEL_ENABLED` | `false` |

## Capabilities (Phase 3)

| Capability | |
|------------|--|
| booking | true |
| tracking | true |
| background status sync | true |
| serviceability | true (`POST /v1/offerings` via shared discovery) |
| cancel | **runtime** — `EKART_CANCEL_ENABLED` (default false); FORWARD → RTO create; REVERSE → Cancel RVP |
| returns | true (REVERSE create on `/v2/shipments/create`) |
| rates | false |
| pickupSync | false |
| createPickup | false (501) |
| ndr | false |
| labels | **false** — Durin `get_label_information` returns COC/route/2d_barcode metadata only; no PDF URL (never faked) |
| webhooks | true (Critical Updates receiver; runtime `EKART_WEBHOOKS_ENABLED`) |

## Phase 3A — Cancel / Reverse / Return

| Action | Durin API | Gate |
|--------|-----------|------|
| Cancel forward | `PUT /v3/shipments/rto/create` | `EKART_CANCEL_ENABLED=true` |
| Cancel reverse | `PUT /v3/shipments/cancel_rvp` | `EKART_CANCEL_ENABLED=true` |
| Create reverse | `POST /v2/shipments/create` with `service_leg: REVERSE` | (booking; not gated by cancel flag) |

When `EKART_CANCEL_ENABLED=false` (default): cancel capability is not exposed and v3 RTO/Cancel RVP are never called. Enable only after Ekart confirms Durin v3 access for your merchant code (docs historically mentioned merchant `MYS`).

## Phase 3B — Labels

**Not implemented as PDF labels.** Official `POST /v2/shipments/get_label_information` returns barcode/route metadata only. ShipAmaze does not invent label URLs.

## Phase 3C — Serviceability

`POST /v1/offerings` → `ProviderCourierOption[]` → shared `discoverServiceability` / discovery controller. No Ekart-only serviceability UI.

## Phase 3D — Webhooks

Official Critical Updates: client enrolls HTTPS URL; Ekart POSTs events.

- Receiver: `POST /api/ekart/webhooks/critical-updates`
- Gate: `EKART_WEBHOOKS_ENABLED=true`
- Optional: `EKART_WEBHOOK_SECRET`
- **Polling remains the source of truth**

## Health / metrics

`GET /api/ekart/health` (admin) includes provider version metadata:

```json
{
  "provider": "ekart",
  "apiVersion": "Durin V2",
  "apiVersionCode": "v2",
  "openApiVersion": "2.0.0",
  "merchantCode": "TEC",
  "enabled": true
}
```

Also: auth latency, booking/tracking metrics, status sync health, webhook flag.

## Limitations

- Large shipment path unused in booking.
- No PDF label API.
- No freight rate API.
- NDR actions not implemented.
- RTO/Cancel RVP may require Ekart merchant enablement.

## Rollback

Set `EKART_ENABLED=false` and restart. Existing Velocity/Lorrigo unchanged.

## Later

- Large shipment path
- NDR actions (if Durin documents a merchant NDR API)
- Label PDF only if Ekart publishes a real label URL/download API
