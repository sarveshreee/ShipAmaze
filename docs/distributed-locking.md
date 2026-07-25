# Distributed Locking

Used by background status/NDR sync (and available for booking coordination) so multiple API instances do not run the same job twice.

## Backends

| Priority | Backend | When |
|----------|---------|------|
| 1 | Process-local mutex | Always (same Node process) |
| 2 | Redis `SET key NX PX ttl` | `REDIS_URL` set **and** `ioredis` installed |
| 3 | Mongo `distributed_locks` | Default cross-instance fallback |

## Setup

### Single instance (Render free / one dyno)

No action required. Process-local + Mongo lock is enough.

### Multiple instances + Redis (recommended)

```bash
cd backend
npm i ioredis
```

```env
REDIS_URL=redis://:password@host:6379
DISTRIBUTED_LOCK_TTL_MS=240000
```

### Multiple instances without Redis

Ensure MongoDB is shared across instances. Locks live in collection `distributed_locks` with TTL via `expiresAt`.

## API

```ts
import { withSyncLock } from "./modules/courier/distributedLock.js";

const result = await withSyncLock("velocity:status", () => provider.syncStatus());
if (result && typeof result === "object" && "skipped" in result && result.skipped) {
  // another instance holds the lock
}
```

## Ops

- Skipped runs log: `[distributed-lock] skip name=…`
- Stale Redis locks expire via PX TTL
- Stale Mongo locks are stolen when `expiresAt < now`
