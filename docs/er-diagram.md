# Entity Relationship Diagram (Courier-focused)

```mermaid
erDiagram
  USER ||--o{ ORDER : creates
  USER ||--o{ PICKUP : owns
  USER ||--o{ WAREHOUSE : owns
  ORDER ||--o| NDR : "awb match"
  PICKUP ||--o{ ORDER : "pickup source"
  WAREHOUSE ||--o| PICKUP : "may sync to"

  USER {
    ObjectId _id
    string email
    string role
    boolean isActive
  }

  ORDER {
    string orderId UK
    string awb
    string status
    string shipmentStatus
    string courierProvider
    string velocityOrderId
    string velocityShipmentId
    string lorrigoOrderId
    string lorrigoShipmentId
    string correlationId
    number bookingVersion
    date lastVelocityStatusSyncedAt
    date lastProviderStatusSyncedAt
    boolean bookingReconciliationRequired
    array providerEvents
    array statusHistory
  }

  NDR {
    string awb UK
    string status
    string reason
    number attempts
    string courierProvider
    string providerStatus
    string customerRemarks
    boolean actionRequired
    string recommendedAction
    string lastNdrFingerprint
    array actionHistory
  }

  PICKUP {
    ObjectId userId
    string warehouseName
    string pincode
    string velocityWarehouseId
    string lorrigoPickupId
    string lorrigoSyncStatus
    boolean isActive
    date deletedAt
  }

  WAREHOUSE {
    ObjectId userId
    string name
    string pincode
    string velocityWarehouseId
  }
```

## Key relationships

- **Order ↔ NDR**: matched by `awb` / `trackingId` (not a formal FK).
- **Order.courierProvider**: `"velocity"` \| `"lorrigo"` — selects adapter for track/cancel/NDR actions.
- **Pickup.lorrigoPickupId**: required before Lorrigo booking.
- **providerEvents**: embedded timeline on Order (capped at 100).

## Recommended indexes (Phase 8)

```js
// Order — status sync fairness
{ courierProvider: 1, status: 1, lastProviderStatusSyncedAt: 1 }
{ status: 1, awb: 1, lastVelocityStatusSyncedAt: 1 }
{ velocityOrderId: 1 } // sparse

// NDR — Active list
{ status: 1, updatedAt: -1 }
```
