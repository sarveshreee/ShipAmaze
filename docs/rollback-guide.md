# Rollback Guide

## Soft rollback (preferred — no redeploy of old build)

| Goal | Action |
|------|--------|
| Disable Lorrigo entirely | Set `LORRIGO_ENABLED=false`, redeploy/restart API |
| Hide Lorrigo from discovery | `COURIER_DISCOVERY_MODE=velocity` |
| Slow Lorrigo load | Increase `LORRIGO_STATUS_SYNC_INTERVAL_MS` / `LORRIGO_NDR_SYNC_INTERVAL_MS` |
| Stop UI Lorrigo booking | Flag off + discovery velocity-only (UI still may show cached options — hard refresh) |

Existing Lorrigo AWBs remain in Mongo; tracking/NDR for those rows may pause while flag is off.

## Hard rollback (previous release)

1. Identify last known-good deploy (git tag / Render release).
2. Redeploy that build.
3. Keep Mongo as-is (schema changes are additive optional fields — forward compatible).
4. Verify:
   - `GET /health`
   - Velocity forward create smoke test
   - NDR list loads
5. Communicate to support: Lorrigo bookings paused if rolling past Lorrigo phases.

## Data compatibility

Phases 1–7 only add optional fields (`courierProvider`, `lorrigo*`, `providerEvents`, NDR fingerprint fields). Rolling back application code does **not** require dropping collections.

## Booking incident rollback

If a bad release double-booked:

1. Soft-disable Lorrigo.
2. Export affected `orderId` / AWB pairs from logs (`correlationId`).
3. Cancel extras at provider dashboard if needed.
4. Patch local orders carefully; prefer support-led correction over bulk scripts.

## Git

Local `main` may be ahead of `origin`. Do not force-push. Prefer revert commits:

```bash
git revert <bad-sha>
```
