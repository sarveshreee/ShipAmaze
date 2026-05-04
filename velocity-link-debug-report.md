# Velocity warehouse link — debug report (Dropshipper pickup address)

**Scope:** Investigates why linking a Dropshipper pickup address to a Velocity warehouse code can return a 403 with a message like “You can only link your own pickup address(es).” **No business-logic change** was applied beyond **temporary `console.log` instrumentation** (frontend + backend) for tracing.

---

## 1. Frontend request trace

| Item | Detail |
|------|--------|
| **Page / component** | `frontend/src/pages/dropshipper/DropshipperPickupAddresses.tsx` — renders a card per address with `VelocityWarehouseLinkCard`. |
| **Link UI component** | `frontend/src/components/VelocityWarehouseLinkCard.tsx` |
| **Function on Link / Save** | `save()` in `VelocityWarehouseLinkCard` (calls `velocityService.linkVelocityWarehouse`). |
| **HTTP method & path** | `POST` **`/velocity/warehouses`** via `apiClient` (base URL from `VITE_API_BASE_URL`, default `http://localhost:5000/api` → full URL **`POST {base}/velocity/warehouses`** i.e. **`/api/velocity/warehouses`** when using default base). |
| **Request body** | `{ linkOnly: true, warehouseId: <string>, velocityWarehouseId: <WH code> }` |
| **Field sent as `warehouseId`** | **`mongoId` prop** passed into the card — from **`a.id`** on each pickup address row. |
| **What `a.id` is** | From `GET /api/pickup-addresses`, each row is mapped in `mapPickupDoc` as **`id: String(a._id)`** (`backend/src/controllers/resourceController.ts`). So **`warehouseId` is the MongoDB `_id` of the `Pickup` collection document**, not a vendor `Warehouse` id. |
| **Temporary log** | In `VelocityWarehouseLinkCard.save()`, before the API call: `console.log("Velocity link request", { warehouseId: mongoId, velocityWarehouseId, note })`. Does **not** log tokens or passwords. |

**Conclusion:** The client is designed to send the **Pickup document’s `_id`** under the legacy field name `warehouseId`. For a dropshipper, that should resolve to a **Pickup**, not a vendor warehouse.

---

## 2. Backend route trace

| Item | Detail |
|------|--------|
| **Route file** | `backend/src/modules/velocity/velocity.routes.ts` |
| **Route** | `router.post("/warehouses", ...)` mounted under `/velocity` in `backend/src/app.ts` → **`POST /api/velocity/warehouses`**. |
| **Middleware** | **Global for router:** `router.use(authMiddleware)` — all authenticated routes load full `User` from JWT `sub` (`backend/src/middleware/authMiddleware.ts`). **For this route:** `requireRoles("admin", "vendor", "dropshipper")` **after** `authMiddleware`. |
| **Allowed roles** | `admin`, `vendor`, `dropshipper`. |
| **Controller** | `createWarehouse` exported from `backend/src/modules/velocity/velocity.controller.ts`. |

**Note:** If the user’s **role is not** in that list, **`requireRoles` returns 403 with message `"Forbidden"`** (see `backend/src/middleware/roleMiddleware.ts`) — that is a **different** failure mode from pickup ownership.

---

## 3. Controller ownership check (`linkOnly`)

**Flow:**

1. **`createWarehouse`** requires `linkOnly` true and `warehouseId`; for link (not unlink), requires `velocityWarehouseId` matching `^WH[A-Z0-9]+$/i`.
2. **`resolveVelocityLinkTarget(mongoId, req.user)`** loads **both** `Warehouse.findById(mongoId)` and `Pickup.findById(mongoId)`.
   - **Dropshipper:** If a **Pickup** exists → `{ kind: "pickup", pu }`. If only a **Warehouse** exists → **403** with message about vendor warehouse. If neither → **404** “Pickup address not found”.
3. For **`kind === "pickup"`**, **`assertPickupAccessForVelocity(req.user, pu)`** runs before `Pickup.findByIdAndUpdate(...)`.

**Ownership logic for dropshipper (pickup):**

- **`dropshipperOwnsPickup(user, pu)`** (`velocity.controller.ts`) returns true if **`authUserIdString(user)`** equals either **`refIdString(pu.userId)`** or **`refIdString(pu.dropshipperId)`**.
- **`authUserIdString`:** `String(user.id ?? user._id)`.
- **`refIdString`:** Handles ObjectId, string, or **populated** `{ _id: ... }` shapes so `String(pu.userId)` is not accidentally `"[object Object]"`.

If not owned, **`AppError(403, "You can only link your own pickup addresses.")`** is thrown (plural in backend).

**Temporary server logs (instrumentation):**

1. **After resolve, link flow:** `console.log("Velocity warehouse link ownership debug", { phase: "after-resolve", …, foundModel: "Pickup" | "Warehouse", foundDocument: { … } })`.
2. **Immediately before that 403 in `assertPickupAccessForVelocity`:** `phase: "before-403-pickup"` including **`foundDocument`** and **`normalized`** (`authUserId`, `refUserId`, `refDropshipperId`, `dropshipperOwnsPickup`).

No passwords or tokens are logged.

---

## 4. Pickup “address” model & APIs

| Item | Detail |
|------|--------|
| **Model file** | `backend/src/models/Pickup.ts` |
| **Collection** | Mongoose default plural: **`pickups`**. |
| **Owner / identity fields on schema** | **`userId`** (required, indexed) — **User** who owns this pickup address. **`dropshipperId`** (optional, indexed) — duplicate owner hint for dropshipper-created rows. **`velocityWarehouseId`** optional string (Velocity WH code after link). |
| **Not present on Pickup** | **`ownerId`**, **`vendorId`**, **`createdBy`** — not defined on this schema (debug logs print them as empty if absent). |
| **List pickup addresses** | `GET /api/pickup-addresses` → `resourceController.listPickupAddresses` — filters **`userId: req.user._id`**. |
| **Create pickup address** | `POST /api/pickup-addresses` → `resourceController.createPickupAddress` — sets **`userId: req.user._id`** and, if role is dropshipper, **`dropshipperId: req.user._id`**. |

---

## 5. Database / “me” checks (manual — no committed script)

**Replace placeholders:** `<PICKUP_OBJECT_ID>` from the browser network request body `warehouseId`; use a Mongo shell connected to your DB.

### A) Inspect the pickup document

```javascript
// mongosh
const id = ObjectId("<PICKUP_OBJECT_ID>");
const p = db.pickups.findOne(
  { _id: id },
  {
    label: 1,
    phone: 1,
    city: 1,
    pincode: 1,
    userId: 1,
    dropshipperId: 1,
    velocityWarehouseId: 1,
  }
);
printjson(p);
```

**Compare:** `String(p.userId)` (and `dropshipperId` if set) must match the logged-in **User** `_id` from JWT/session (see B).

### B) Current user from API

```http
GET /api/auth/me
Authorization: Bearer <your_token>
```

Response includes `user.id` (string), `user.email`, `user.role`, `user.name`, etc. (`backend/src/controllers/authController.ts` → `toPublicUser`).

**Privacy:** When recording in tickets, mask email, e.g. `ab***@domain.com`.

### C) Optional one-off Node (if you use backend `.env` `MONGO_URI`)

Run locally outside the repo (or a throwaway file **not** committed): connect with mongoose, `Pickup.findById(id).lean()`, print `userId` / `dropshipperId`, then exit. **This report does not add a committed script** (per cleanup instructions).

---

## 6. Why 403 happens (logic-level “exact reason”)

A 403 with copy about **only linking your own pickup** is thrown only when:

1. **Role is dropshipper**, **`assertPickupAccessForVelocity`** runs on a **Pickup** document, and **`dropshipperOwnsPickup`** is **false**.

So the backend believes **`authUserIdString(user)` does not match** either normalized **`pu.userId`** or **`pu.dropshipperId`**.

**Typical root causes (check logs + DB):**

| Cause | How to confirm |
|--------|----------------|
| **Pickup row `userId` is missing, wrong ObjectId, or points at another user** | `db.pickups.findOne` vs `GET /auth/me` `user.id`. |
| **Legacy / imported data** without `userId` aligned to `users` | Same comparison; list endpoint might not show other users’ rows, but **stale UI or wrong id** could still POST an old id. |
| **ID collision:** same hex exists as **Warehouse** and **Pickup** | For dropshipper, resolver **prefers Pickup if `pu` exists** — ownership still uses that Pickup’s `userId`. |
| **Different 403:** **`requireRoles` “Forbidden”** | User role not in `admin|vendor|dropshipper` — not the pickup ownership message. |

**UI copy note:** Backend uses **“…pickup addresses.”** (plural). The frontend `VelocityWarehouseLinkCard` maps some 403s to **singular** “pickup address” when normalizing generic errors—so the toast text may differ slightly from the API `error` string.

---

## 7. Recommended next steps (**not applied** in this task)

1. **Reproduce once** with server logs: confirm **`phase: "after-resolve"`** shows `foundModel: "Pickup"` and inspect **`foundDocument.userId`** vs **`userId`** in the same log.
2. **If `normalized.refUserId` / `refDropshipperId` differ from `normalized.authUserId`:** fix **data** (`pickups.userId`) or identify how that pickup was created without correct **`userId`**.
3. **Remove temporary `console.log`** from `velocity.controller.ts` and `VelocityWarehouseLinkCard.tsx` after debugging to avoid noise and accidental PII in logs.
4. **If role 403:** verify JWT user role in DB matches **dropshipper**.

---

## 8. Files touched for this report

| File | Change |
|------|--------|
| `backend/src/modules/velocity/velocity.controller.ts` | Temporary structured logs: after resolve (link), before pickup 403. |
| `frontend/src/components/VelocityWarehouseLinkCard.tsx` | Temporary `console.log` before link API call. |
| `velocity-link-debug-report.md` | This document. |

No `.env` changes. No separate DB script committed.
