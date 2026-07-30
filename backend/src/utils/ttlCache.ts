/**
 * Simple in-process TTL cache for hot API payloads (dashboard, couriers, auth users).
 * Safe for single-instance Render deployments; invalidated explicitly on writes.
 */

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(private readonly defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deletePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}

/** Auth user docs — short TTL; invalidated on profile/status changes when possible. */
export const authUserCache = new TtlCache<unknown>(60_000);

/** Dashboard summary payloads per user. */
export const dashboardCache = new TtlCache<unknown>(45_000);

/** Reference data that rarely changes. */
export const couriersCache = new TtlCache<unknown>(5 * 60_000);
export const warehousesCache = new TtlCache<unknown>(2 * 60_000);
export const pickupsCache = new TtlCache<unknown>(2 * 60_000);
export const settingsCache = new TtlCache<unknown>(5 * 60_000);

export function invalidateUserScopedCaches(userId?: string): void {
  if (userId) {
    authUserCache.delete(`user:${userId}`);
    dashboardCache.delete(`dash:${userId}`);
    pickupsCache.deletePrefix(`pickups:${userId}`);
    warehousesCache.deletePrefix(`wh:`);
  } else {
    dashboardCache.clear();
    pickupsCache.clear();
    warehousesCache.clear();
  }
}
