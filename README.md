# ShipAmaze (MERN)

Monorepo-style app: Vite + React frontend and Express + MongoDB backend.

## Frontend

1. In `frontend/`, copy `.env.example` to `.env` and set the API base URL (includes `/api` path):

   - `VITE_API_BASE_URL=http://localhost:5000/api`

2. From `frontend/`:

   ```bash
   npm install
   npm run dev
   ```

   The Vite dev server uses port `8080` by default (see `frontend/vite.config.ts`).

## First admin user

The signup UI only offers **vendor** and **dropshipper**. To create an **admin**, call the API once (e.g. with curl or Postman): `POST /api/auth/register` with JSON body `{ "email", "password", "name", "role": "admin" }` (optional `companyName`, `phone`). Then sign in at `/login` with that email.

## Backend

1. In `backend/`, copy `.env.example` to `.env` and set `MONGODB_URI` and `JWT_SECRET` (and any other variables your deploy needs).

2. Start MongoDB locally or point `MONGODB_URI` to your cluster.

3. From `backend/`:

   ```bash
   npm install
   npm run dev
   ```

   The API is expected to listen on port `5000` when using the default frontend env above; adjust if your `backend` uses another port and update `VITE_API_BASE_URL` accordingly.

## Build (frontend)

```bash
cd frontend
npm run build
```

This runs `vite build` for the frontend.

---

## Velocity Shipping Integration

ShipAmaze integrates with [Velocity Shipping](https://shazam.velocity.in) as the courier provider.

### Environment variables (backend)

Add these to `backend/.env` (copy from `backend/.env.example`):

```env
VELOCITY_BASE_URL=https://shazam.velocity.in
VELOCITY_USERNAME=your_velocity_username
VELOCITY_PASSWORD=your_velocity_password
VELOCITY_TOKEN_CACHE_TTL_MINUTES=1320
```

> The token is cached server-side. Credentials are never sent to the browser.

### Full shipment flow

```
1. Shopify sync (or manual order creation) imports an order into the system.

2. Open the order → Order Detail drawer.

3. Click "Generate AWB / Ship Now".
   → Calls: POST /api/velocity/forward/create
   → Velocity returns AWB, courier name, label URL, charges.
   → Order is updated locally with all Velocity fields.

4. Label download / open via the label buttons in the Order drawer.

5. Tracking page (/track) shows real Velocity timeline pulled from:
   GET /api/velocity/track/public/:awb

6. If delivery fails → order moves to NDR status automatically.

7. Return / reverse pickup:
   → Click "Create Return Pickup" in the Order drawer.
   → Calls: POST /api/velocity/reverse/create

8. Cancel a shipment:
   → Click "Cancel Order" when an AWB exists.
   → Calls: POST /api/velocity/cancel (sends AWB to Velocity).
   → Order status updated to "cancelled".

9. Rate calculator (Dropshipper → Rates):
   → Uses: POST /api/velocity/rates (real live rates from Velocity).

10. Pincode serviceability check:
    → Uses: POST /api/velocity/serviceability (real Velocity data).
```

### New backend API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/velocity/track/public/:awb` | None | Public shipment tracking |
| POST | `/api/velocity/serviceability` | Any role | Check carrier serviceability |
| POST | `/api/velocity/rates` | Any role | Get live shipping rates |
| POST | `/api/velocity/warehouses` | Admin, Vendor | Register warehouse with Velocity |
| POST | `/api/velocity/forward/create` | Any role | Create forward shipment (AWB + label) |
| POST | `/api/velocity/forward/create-order-only` | Any role | Create order without AWB |
| POST | `/api/velocity/forward/create-shipment` | Any role | Assign AWB to existing order |
| POST | `/api/velocity/reverse/create` | Any role | Create return/reverse shipment |
| POST | `/api/velocity/reverse/create-order-only` | Any role | Create reverse order without AWB |
| POST | `/api/velocity/reverse/create-shipment` | Any role | Assign AWB to reverse order |
| POST | `/api/velocity/cancel` | Any role | Cancel a shipment by AWB |
| POST | `/api/velocity/track` | Any role | Track authenticated shipment |
| POST | `/api/velocity/shipments` | Admin only | List provider-side shipments |
| POST | `/api/velocity/returns` | Admin only | List provider-side returns |
| POST | `/api/velocity/reports` | Admin only | Pull provider reports |

### Order model – new optional fields

The following fields were added to the `Order` MongoDB document (all optional, existing data untouched):

`velocityOrderId`, `velocityShipmentId`, `velocityReturnId`, `courierCompanyId`, `courierName`, `labelUrl`, `manifestUrl`, `shippingCharges`, `codCharges`, `rtoCharges`, `shipmentStatus`, `trackingUrl`, `trackingActivities[]`, `velocityWarehouseId`, `assignedDateTime`, `state`

### Warehouse flow

Before creating a shipment you need a Velocity `warehouse_id`.  
Register your pickup address warehouse once:

```
POST /api/velocity/warehouses
Body: { "warehouseId": "<local MongoDB warehouse _id>" }
```

The returned `warehouse_id` is saved as `velocityWarehouseId` on the local `Warehouse` document.
Set it on orders (`velocityWarehouseId`) so the Generate AWB button can auto-populate it.
