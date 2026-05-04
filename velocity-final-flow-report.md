# Velocity final flow report

**Date:** 2026-05-04  

## Policy change: no warehouse creation via API

Velocity pickup warehouses are maintained in the **Velocity dashboard**. The backend **does not** call `POST /custom/api/v1/warehouse` anymore.

The only supported operation on `POST /api/velocity/warehouses` is **linking** an existing Velocity warehouse id to a local MongoDB `Warehouse`:

```json
{
  "linkOnly": true,
  "warehouseId": "<local_mongo_warehouse_id>",
  "velocityWarehouseId": "WHZBRR"
}
```

Response (example shape):

```json
{
  "success": true,
  "data": {
    "warehouse_id": "WHZBRR",
    "linked": true,
    "manual": true
  }
}
```

This persists `velocityWarehouseId` on the `Warehouse` model (`Warehouse.velocityWarehouseId`).

---

## Forward / reverse: how `warehouse_id` is chosen

`warehouse_id` sent to Velocity is resolved in this order:

1. Explicit `warehouse_id` / `warehouse_id` body field (Velocity code, e.g. `WHZBRR`).
2. `order.velocityWarehouseId` on the linked order (copied there after a successful forward/reverse when resolved).
3. `warehouseId` (or `pickupWarehouseId`) = local MongoDB **`Warehouse` `_id`** with a non-empty linked `velocityWarehouseId` (vendor/admin access checked).

If any other body is sent without `linkOnly: true` to `POST /api/velocity/warehouses`, the API returns **400** with guidance to use the dashboard + `linkOnly`.

---

## Full shipment test checklist (after link)

**Prerequisites**

- API running with valid `VELOCITY_*` env and MongoDB.
- JWT for a user that can access the order and warehouse (admin or owning vendor).
- Local `Warehouse` document id (from your app / `GET /api/warehouses`).
- Velocity warehouse code (e.g. `WHZBRR` from the dashboard).

**1. Link**

```http
POST /api/velocity/warehouses
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "linkOnly": true,
  "warehouseId": "<local_mongo_warehouse_id>",
  "velocityWarehouseId": "WHZBRR"
}
```

**2. Create or pick an order** with valid customer + pincode (or use existing `orderId`).

**3. Forward (AWB)**

```http
POST /api/velocity/forward/create
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "orderId": "<your orderId>",
  "warehouseId": "<same local_mongo_warehouse_id>"
}
```

Alternatively pass `"warehouse_id": "WHZBRR"` directly, or ensure the order already has `velocityWarehouseId` set from a prior shipment.

**4. Authenticated tracking**

```http
POST /api/velocity/track
Authorization: Bearer <jwt>
Content-Type: application/json

{ "awb": "<awb from step 3>", "orderId": "<optional>" }
```

**5. Public tracking**

```http
GET /api/velocity/track/public/<awb>
```

Requires a local `Order` with that `awb` (same as existing behaviour).

**6. Cancel**

```http
POST /api/velocity/cancel
Authorization: Bearer <jwt>
Content-Type: application/json

{ "awbs": ["<awb>"], "orderId": "<orderId>" }
```

**7. Reverse pickup**

```http
POST /api/velocity/reverse/create
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "orderId": "<orderId>",
  "warehouseId": "<local_mongo_warehouse_id>",
  "pickup_customer": { ... },
  "items": [ { "name": "Item", "qty": 1, "price": 100 } ]
}
```

(or `warehouse_id`: `WHZBRR` if you skip Mongo resolution)

---

## Live run status (this workspace)

`http://localhost:5000` was **not reachable** at report time, so **forward / tracking / public / cancel / reverse were not executed end-to-end here**. Re-run the checklist above in your environment after starting the API.

---

## Files changed (summary)

| Area | File |
|------|------|
| Velocity warehouse route | `backend/src/modules/velocity/velocity.controller.ts` — link-only; `mergeVelocityWarehouse`; forward/reverse use linked id; persist `velocityWarehouseId` on orders |
| Velocity service | `backend/src/modules/velocity/velocity.service.ts` — removed `createWarehouse` (no provider warehouse POST) |
| Docs | `README.md` — warehouse flow updated |
| Frontend Velocity client | `frontend/src/services/velocityService.ts` — `linkVelocityWarehouse`, `warehouseId` on forward/reverse params |

---

## Quick PowerShell test driver (optional)

Replace placeholders; use `;` not `&&` in PowerShell:

```powershell
$base = "http://localhost:5000/api"
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@admin.com","password":"admin@123"}'
$t = $login.token
$h = @{ Authorization = "Bearer $t"; "Content-Type" = "application/json" }

Invoke-RestMethod -Uri "$base/velocity/warehouses" -Method POST -Headers $h -Body '{"linkOnly":true,"warehouseId":"<mongo_wh_id>","velocityWarehouseId":"WHZBRR"}'
```

---

## UI note

`OrderDetailDrawer` still calls `createForwardShipment({ orderId })` only. For orders without `velocityWarehouseId`, pass **`warehouseId`** from the UI once this flow is wired, or set `order.velocityWarehouseId` in the database after the first successful shipment.
