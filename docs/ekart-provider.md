# Ekart Provider (Phase 1)

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
  → store response tracking_id as Order.awb / ekartTrackingId
```

**No** `syncPickupToEkart`, **no** provider pickup IDs.

Optional future: `Pickup.ekartLocationCode` → `source.location_code` when set; otherwise full address.

### Tracking ID note

Durin OpenAPI requires a client-supplied `tracking_id` in format `{MERCHANT}{P|C|R}{10 digits}`. Phase 1 derives a compliant id from merchant code + order id for the **request**. The **stored AWB** is always the tracking id returned in the create response.

## Tracking flow

`POST /v2/shipments/track` with `{ tracking_ids: [awb] }` → normalized `ProviderTrackingResult` → Order status history / provider events / background sync.

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

## Capabilities (Phase 1)

| Capability | |
|------------|--|
| booking | true |
| tracking | true |
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

- `GET /api/ekart/health` (admin)
- Booking metrics also under `GET /api/courier/…` booking metrics payload (`ekart` key)

## Limitations

- Large shipment endpoints configured but not used in Phase 1 booking.
- No PDF label API (Durin `get_label_information` is metadata only).
- No cancel/RTO/RVP in Phase 1.
- No reverse shipments in Phase 1.
- No freight rate API.
- Critical Updates webhooks not enrolled.

## Rollback

Set `EKART_ENABLED=false` and restart. Existing Velocity/Lorrigo unchanged. Optional Order/Pickup fields remain unused.

## Phase 2 (planned)

- Cancel via RTO / Cancel RVP
- Reverse shipments
- Large shipment path
- Optional Critical Updates webhooks
- Label generation strategy (if product needs it)
