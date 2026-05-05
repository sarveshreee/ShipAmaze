# Velocity Real Order Debug

## Target
- `orderId`: `shopify-trendbayy-myshopify-com-6454818766907`

## Execution result in this environment

Attempted command:
- `node --import dotenv/config ./tmp_velocity_order_debug.mjs` (from `backend`)

Result:
```text
Error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.fsyuytc.mongodb.net
code: 'ECONNREFUSED'
syscall: 'querySrv'
```

Because MongoDB DNS lookup failed in this runtime, I could not fetch the live order document here.

## Ready local debug script (sanitized only)

I created a runnable script at:
- `backend/tmp_velocity_order_debug.mjs`

What it prints (sanitized):
1. **Order identity**
   - `_id`, `orderId`, `orderNumber`, `externalOrderId`, `velocityOrderId`, `velocityShipmentId`, `awbCode`, `labelUrl`
2. **Customer**
   - `name`, masked `phone`, masked `email`, `address`, `city`, `state`, `pincode`
3. **Package**
   - `weight`, `length`, `breadth`, `width`, `height`
4. **Items (whichever exists)**
   - `items`, `orderItems`, `lineItems`, `products`, `shopifyLineItems`, `rawShopifyOrder.line_items`
5. **Pickup**
   - `pickupAddressId`, `pickupWarehouseId`, `pickupAddress`, `velocityWarehouseId`
6. **Velocity payload (sanitized)**
   - `order_id`, `billing_pincode`, `warehouse_id`, `order_items`, `payment_method`, `sub_total`, `cod_collectible`, `weight/length/width/height`

No passwords/tokens are printed. Phone/email are masked.

## Run locally (where Mongo connects)

From repo root:
```bash
cd backend
node --import dotenv/config ./tmp_velocity_order_debug.mjs
```

Expected output:
- one JSON object containing the full sanitized debug block requested above.

## Notes on payload exactness

- The script reconstructs the `/api/velocity/forward/create` provider payload using current backend mapping logic and `buildVelocityForwardOrchestrationPayload` from `dist`.
- This matches current runtime mapper behavior for sanitized payload output fields.
