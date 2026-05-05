# Velocity Forward Create Debug Report

## Scope
- Investigated `POST /api/velocity/forward/create` failure patterns:
  - `"Order already exists"`
  - `500 Internal Server Error` (UI-visible generic error)
- No code fixes applied in this investigation.

## 1) Endpoint chain (route -> controller -> service -> payload mapper)
- **Route file:** `backend/src/modules/velocity/velocity.routes.ts`
  - `router.post("/forward/create", vc.createForwardShipment);`
- **Controller function:** `createForwardShipment` in `backend/src/modules/velocity/velocity.controller.ts`
- **Service function:** `createForwardShipment` in `backend/src/modules/velocity/velocity.service.ts`
  - Calls Velocity endpoint: `"/custom/api/v1/forward-order-orchestration"`
- **Payload mapper:** `buildVelocityForwardOrchestrationPayload` in `backend/src/modules/velocity/velocity.payload.ts`
  - Builds provider body including `order_items`.

## 2) Latest failing request data (sanitized)

### 2.1 Frontend request body sent to backend
From `frontend/src/components/RichOrdersTable.tsx` (Create Shipment action), request payload to `/velocity/forward/create` is:

```json
{
  "orderId": "<local order id>",
  "warehouseId": "<selected warehouse mongo id or empty>",
  "carrier_id": "<selected carrier id or empty>"
}
```

Observed call source:
- `frontend/src/components/RichOrdersTable.tsx` -> `onCreateShipment({ orderId, warehouseId, carrier_id })`
- `frontend/src/services/velocityService.ts` -> `apiClient.post("/velocity/forward/create", params)`

### 2.2 Backend mapped payload to Velocity (sanitized shape)
In controller/service flow:
- `buildForwardPayload(...)` builds internal payload fields:
  - `order_id`, `warehouse_id`, `payment_mode`, `cod_amount`, `order_amount`
  - `customer` (name/phone/email/address/city/state/pincode/country)
  - `items[]` (mapped from multiple order item fields)
  - `weight/length/width/height`
- `buildVelocityForwardOrchestrationPayload(...)` maps to provider payload with:
  - `warehouse_id`
  - `order_id`
  - `payment_mode`
  - `order_amount`
  - `weight`, `length`, `width`, `height`
  - `billing_*` fields
  - `customer`
  - `order_items[]` (`name`, `sku`, `units`, `selling_price`, `discount`, `tax`)
  - `items` (internal mirror)
  - optional `cod_amount`
  - optional `carrier_id`

### 2.3 Requested exact values for the latest failing order
Order requested for lookup:
- `shopify-trendbayy-myshopify-com-6454818766907`

Result:
- **Could not retrieve live DB document from this environment** due Mongo SRV DNS failure.
- Reproduced error while querying Mongo directly:
  - `Error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.fsyuytc.mongodb.net`

So these exact runtime fields could not be read in this environment:
- local order `_id/orderId/orderNumber`
- exact `velocity order_id` sent
- exact `warehouseId/warehouse_id`
- exact mapped `customer`, `order_items`, `payment_method`, `sub_total`, `cod_collectible`, dimensions/weight for the latest failure

## 3) Provider response logging path

### 3.1 Velocity endpoint called
- `POST /custom/api/v1/forward-order-orchestration`
  - from `velocity.service.ts` via `velocityPost(...)`

### 3.2 Status code and error body handling
In `velocity.client.ts`:
- Logs request start: `[velocity] POST <endpoint>`
- On non-2xx:
  - logs error payload:
    - `console.error([velocity] <endpoint> error <status>, <provider body>)`
  - extracts message from `meta.message | message | error | detail`
  - throws `AppError(mappedStatus, extractedMessage)` + attaches provider error info

Status mapping:
- Velocity `400` -> app `400`
- Velocity `401` -> app `502`
- Velocity `422` -> app `422`
- Velocity `5xx` -> app `502`

### 3.3 Why UI can show generic 500
If an error is thrown outside `AppError` handling path (unexpected runtime exception), `errorMiddleware` returns:
- `500` with `{ "error": "Internal server error" }`

This explains intermittent `"500 Internal Server Error"` reports when exceptions are not normalized as `AppError`.

## 4) DB check for order `shopify-trendbayy-myshopify-com-6454818766907`

Requested fields:
- `_id`
- `orderId/orderNumber/externalOrderId`
- `velocityOrderId`
- `velocityShipmentId`
- `awbCode`
- `labelUrl`
- `shipmentStatus`
- `items/orderItems/lineItems/products`
- `rawShopifyOrder.line_items`
- customer/shipping fields
- package fields
- `pickupAddress/pickupWarehouseId/velocityWarehouseId`

Status:
- **Not retrievable from this environment currently** due:
  - `querySrv ECONNREFUSED _mongodb._tcp.cluster0.fsyuytc.mongodb.net`

## 5) Why "Order already exists" happens

Based on current controller logic and provider semantics:

1. **Duplicate Velocity `order_id` is the trigger**
   - Velocity treats `order_id` as unique in forward-order orchestration.
   - Reusing same `order_id` in orchestration can return `"Order already exists"`.

2. **Retry path behavior**
   - If local order already has `velocityOrderId` and no AWB, controller first tries:
     - `createForwardShipmentLater(order_id=localOrder.velocityOrderId)`
   - If orchestration still returns duplicate message, controller fallback tries `createForwardShipmentLater(...)`.

3. **When duplicate still surfaces**
   - If order exists in Velocity but local DB lacks/has stale `velocityOrderId` or shipment linkage, orchestration may be retried with an already-used `order_id`.
   - If follow-up `createForwardShipmentLater` also fails, controller returns conflict:
     - `"This order already exists in Velocity..."`

Conclusion:
- `"Order already exists"` is consistent with provider-side duplicate `order_id` detection and retry with same identifier lineage.

## 6) Create-order-only / create-shipment-later flow existence

Implemented:
- `POST /api/velocity/forward/create-order-only` -> `createForwardOrderOnly`
  - creates Velocity order without AWB
  - persists `velocityOrderId` locally
- `POST /api/velocity/forward/create-shipment` -> `createForwardShipmentLater`
  - creates AWB for existing Velocity `order_id`

How current `/forward/create` uses this flow:
- If `localOrder.velocityOrderId` exists and AWB missing, it directly uses **create-shipment-later**.
- On duplicate-order error from orchestration, it attempts **create-shipment-later** fallback.

## 7) Root cause, sanitized payload/error, recommended fix

### Exact root cause (with available evidence)
- Primary issue is duplicate provider `order_id` reuse across retries when provider already has that order, combined with partial local linkage states.
- Secondary issue for generic UI 500 is unnormalized exceptions hitting default error middleware path.

### Sanitized Velocity payload (shape)
```json
{
  "warehouse_id": "WH****",
  "order_id": "shopify-trendbayy-myshopify-com-***********",
  "payment_mode": "cod|prepaid",
  "order_amount": 0,
  "weight": 0,
  "length": 0,
  "width": 0,
  "height": 0,
  "billing_customer_name": "<name>",
  "billing_last_name": "<optional>",
  "billing_address": "<address>",
  "billing_city": "<city>",
  "billing_state": "<state>",
  "billing_pincode": "******",
  "billing_country": "India",
  "billing_phone": "******1234",
  "billing_email": "a***z@domain.com",
  "customer": {
    "name": "<name>",
    "phone": "******1234",
    "email": "a***z@domain.com",
    "address": "<address>",
    "city": "<city>",
    "state": "<state>",
    "pincode": "******",
    "country": "India"
  },
  "order_items": [
    {
      "name": "<item>",
      "sku": "<sku>",
      "units": 1,
      "selling_price": 1,
      "discount": 0,
      "tax": 0
    }
  ]
}
```

### Sanitized Velocity error response (shape)
```json
{
  "provider": "velocity",
  "providerStatusCode": 4xx,
  "message": "Order already exists",
  "providerError": {
    "meta": {
      "message": "Order already exists"
    }
  }
}
```

### Recommended fix (no implementation in this task)
1. Persist and trust a single canonical mapping:
   - local `orderId` -> `velocityOrderId` once created.
2. Before orchestration retry, perform explicit idempotency check path:
   - if local `velocityOrderId` exists, skip orchestration and only run create-shipment-later.
3. Ensure all non-AppError exceptions in forward flow are wrapped into `AppError` with explicit context so UI never receives generic 500.
4. Add structured request/response correlation logs (request id + order id + velocity order id + provider status).

## Build verification
- Ran backend build:
  - command: `npm run build` (in `backend`)
  - result: success (`tsc` passed)
