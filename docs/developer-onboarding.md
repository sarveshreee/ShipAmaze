# Developer Onboarding — ShipAmaze Couriers

## Repo layout

```
ShipAmaze/
  frontend/          React + Vite merchant/admin UI
  backend/           Express + Mongo API
  docs/              Architecture, ops, audits
```

## Prerequisites

- Node 20+
- MongoDB (local or Atlas)
- Copy `backend/.env.example` → `backend/.env`
- Optional: Velocity + Lorrigo sandbox credentials

## Local boot

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

API default: `http://localhost:5000`  
UI default: Vite port from `frontend` config.

## Essential env (dev)

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | Database |
| `JWT_SECRET` / `ENCRYPTION_SECRET` | Auth / token encryption |
| `VELOCITY_USERNAME` / `VELOCITY_PASSWORD` | Velocity API |
| `LORRIGO_ENABLED=true` | Turn on Lorrigo |
| `LORRIGO_EMAIL` / `LORRIGO_PASSWORD` | Lorrigo login |
| `COURIER_DISCOVERY_MODE=both` | Multi-provider rates (optional) |

## Where to read code

1. Contract: `backend/src/modules/courier/CourierProvider.ts`
2. Registry: `providerRegistry.ts` + `registerProviders.ts`
3. Discovery: `discoverCouriers.ts`
4. Lorrigo booking: `bookShipment.ts`
5. NDR: `lorrigo.ndr.ts`, `lorrigo.ndrSync.ts`, `resourceController.submitNdrAction`
6. UI NDR: `frontend/src/pages/admin/AdminNDR.tsx`

## Day-1 checklist

- [ ] Health: `GET /health` → ok
- [ ] Login as admin seed user
- [ ] Create a pickup address; with Lorrigo enabled see sync badge / retry
- [ ] Process Selected → Velocity booking still works
- [ ] With `COURIER_DISCOVERY_MODE=both`, serviceability shows both providers
- [ ] Book one Lorrigo shipment (sandbox)
- [ ] Open NDR page → Sync NDR
- [ ] Run tests: `cd backend && npm test`

## Coding conventions

- Prefer shared `CourierProvider` over provider-specific controllers for new work.
- Append timeline events; never rewrite history.
- Keep optional DB fields; do not break Velocity column names.
- Match existing error / toast style; no secrets in logs.

## Useful commands

```bash
cd backend && npm run typecheck && npm test && npm run build
cd frontend && npm run build
```
