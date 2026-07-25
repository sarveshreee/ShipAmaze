# Provider Integration Guide

How to add a new courier provider without breaking Velocity or Lorrigo.

## 1. Implement `CourierProvider`

Create `backend/src/modules/courier/providers/<name>/<name>CourierProvider.ts` implementing:

| Method | Required |
|--------|----------|
| `isConfigured` / `authenticate` | Yes |
| `serviceability` / `getRates` | If `capabilities` say so |
| `createPickup` / `createShipment` / `cancelShipment` | Booking providers |
| `trackShipment` / `getShipment` / `syncStatus` | Tracking providers |
| `supportsNDR` / `fetchNDR` / `performNDRAction` / `syncNDR` | NDR providers |

Shared types live in `backend/src/modules/courier/types.ts`.

## 2. Declare capabilities

Add a static map in `capabilities.ts` and mirror (temporarily) in `frontend/src/lib/providerCapabilities.ts`. Prefer serving live caps from `GET /api/courier/providers`.

## 3. Register

In `registerProviders.ts`:

```ts
if (isMyProviderEnabledFlag()) {
  registerCourierProvider(myCourierProvider);
}
```

Gate with a feature flag (`MYPROVIDER_ENABLED`).

## 4. Shared HTTP

Use `providerHttpClient` + `sanitizeForProviderLog`. Never log tokens. Map failures through `buildProviderAppError` **without** returning raw bodies to clients.

## 5. Normalize

- Couriers → `finalizeCourierOption`
- Status → `statusNormalize`
- NDR → `ProviderNdrRecord` shape:

```ts
{
  provider: "myprovider",
  awb: "...",
  reason: "...",
  actionRequired: true,
  recommendedAction: "reattempt",
  providerStatus: "...",
  customerRemarks: "...",
  metadata: { ... }
}
```

## 6. Optional order fields only

Add sparse optional fields on `Order` / `Pickup` / `NDR`. Do not rename Velocity fields.

## 7. Background sync

Add a dedicated interval in `server.ts` with `.unref()`, configurable interval, and an in-flight mutex. Only poll **active** shipments.

## 8. Controllers stay provider-agnostic

```ts
const id = resolveCourierProviderId(order.courierProvider);
const provider = getCourierProvider(id);
if (!provider.supportsNDR()) throw new AppError(501, "...");
await provider.performNDRAction(...);
```

## 9. Tests

Minimum coverage:

- Auth / configured gate
- Normalize unit tests
- Booking success + Mongo failure reconciliation
- Sync duplicate suppression
- Provider failure isolation in discovery
- NDR action + metrics (if applicable)

## 10. Do not

- Branch UI/controllers on `if (provider === "lorrigo")` for new features when a capability exists
- Retry non-idempotent booking POSTs blindly
- Overwrite `providerEvents` / `statusHistory`
- Break the Velocity forward-create path
