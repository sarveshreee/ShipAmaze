/**
 * Optional in-memory TTL cache for successful serviceability / rates results.
 * Failures are never cached.
 */

import type { ProviderCourierOption } from "./types.js";
import { discoveryConfig } from "./discoveryConfig.js";

type CacheEntry = {
  expiresAt: number;
  couriers: ProviderCourierOption[];
};

const store = new Map<string, CacheEntry>();

export function buildServiceabilityCacheKey(parts: {
  provider: string;
  kind: "serviceability" | "rates";
  fromPincode: string;
  toPincode: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  paymentMode: string;
}): string {
  const w = parts.weightKg != null && Number.isFinite(parts.weightKg) ? parts.weightKg.toFixed(3) : "-";
  const l = parts.lengthCm != null && Number.isFinite(parts.lengthCm) ? parts.lengthCm.toFixed(1) : "-";
  const wi = parts.widthCm != null && Number.isFinite(parts.widthCm) ? parts.widthCm.toFixed(1) : "-";
  const h = parts.heightCm != null && Number.isFinite(parts.heightCm) ? parts.heightCm.toFixed(1) : "-";
  return [
    parts.kind,
    parts.provider,
    parts.fromPincode,
    parts.toPincode,
    w,
    `${l}x${wi}x${h}`,
    parts.paymentMode,
  ].join("|");
}

export function getCachedCouriers(key: string): ProviderCourierOption[] | null {
  if (!discoveryConfig.cacheEnabled) return null;
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  // Return a shallow copy so callers cannot mutate the cache entry.
  return hit.couriers.map((c) => ({ ...c, metadata: c.metadata ? { ...c.metadata } : undefined }));
}

export function setCachedCouriers(key: string, couriers: ProviderCourierOption[]): void {
  if (!discoveryConfig.cacheEnabled) return;
  const ttlMs = discoveryConfig.cacheTtlSeconds * 1000;
  store.set(key, {
    expiresAt: Date.now() + ttlMs,
    couriers: couriers.map((c) => ({ ...c, metadata: c.metadata ? { ...c.metadata } : undefined })),
  });
}

/** Test helper */
export function clearServiceabilityCacheForTests(): void {
  store.clear();
}
