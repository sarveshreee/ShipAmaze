# Partner API Endpoints

## POST /serviceability

```json
{
  "fromPincode": "110001",
  "toPincode": "400001",
  "paymentMode": "cod",
  "weight": 0.5,
  "dimensions": { "length": 10, "width": 10, "height": 5 },
  "codValue": 1299,
  "provider": "ekart"
}
```

## POST /rates

Same body as serviceability; `weight` required. COD requires `codValue`.

## POST /shipments

**Header:** `Idempotency-Key: <unique>`

```json
{
  "referenceId": "ORDER-10001",
  "pickupAddressId": "<ShipAmaze Pickup _id>",
  "provider": "ekart",
  "customer": {
    "name": "Customer",
    "phone": "9999999999",
    "email": "customer@example.com",
    "address": "Address",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  },
  "package": {
    "weight": 0.5,
    "length": 10,
    "width": 10,
    "height": 5
  },
  "paymentMode": "cod",
  "codAmount": 1299,
  "courierId": "ekart"
}
```

**201 response:**

```json
{
  "success": true,
  "data": {
    "shipmentId": "SP1738...",
    "referenceId": "ORDER-10001",
    "awb": "...",
    "provider": "ekart",
    "status": "BOOKED"
  },
  "requestId": "...",
  "correlationId": "..."
}
```

## GET /shipments/:referenceId

Returns normalized shipment snapshot for the partner's `referenceId`.

## POST /shipments/:referenceId/track

Live tracking from courier provider.

## POST /shipments/:referenceId/cancel

Cancels at provider when capability allows.

**Ekart:** cancellation requires `EKART_CANCEL_ENABLED=true` on the server. When disabled, cancel returns `501`.

## Lorrigo pickup requirements

For `provider: "lorrigo"`:

- `pickupAddressId` must be a ShipAmaze Pickup owned by the partner's linked dropshipper user.
- The pickup must be **synchronized to Lorrigo** (`lorrigoPickupId` present, sync not `FAILED`) before booking.
- `courierId` is required and must match a serviceable Lorrigo courier for the lane.

Validation runs **before** order creation — unsynced pickups return `422` without creating an order.

## Admin partner status

Owner admins can change partner status via:

`PATCH /api/admin/partners/:id/status`

Body: `{ "status": "ACTIVE" | "SUSPENDED" | "DISABLED", "reason": "optional" }`

Suspended or disabled partners cannot authenticate — all API keys are rejected immediately.

## Rate limits (defaults)

| Limiter | Default |
|---------|---------|
| General API | 120/min per partner |
| Booking | 10/min per partner |
| Auth failures | 30/min per IP |

Returns `429` with `Retry-After` header.

## Billing

See [partner-api.md](./partner-api.md#billing-partner_wallet_billing_enabled).

| Provider | Wallet behavior when billing enabled |
|----------|----------------------------------------|
| Lorrigo | Partner precheck → book → debit once |
| Ekart | Partner precheck → book → debit once |
| Velocity | Existing Velocity internal wallet flow only |

Insufficient balance:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient wallet balance for this shipment",
    "retryable": false
  },
  "requestId": "...",
  "correlationId": "..."
}
```

Cancellation does not automatically credit the wallet.
