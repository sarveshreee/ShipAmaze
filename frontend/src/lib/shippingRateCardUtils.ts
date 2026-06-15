/** Shared zone rate-card helpers (admin + dropshipper). */

/** Volumetric weight (kg) from cm dimensions — divisor 5000 (standard air/surface). */
export function computeVolumetricWeightKg(lengthCm: number, widthCm: number, heightCm: number): number | null {
  if (!(lengthCm > 0 && widthCm > 0 && heightCm > 0)) return null;
  return (lengthCm * widthCm * heightCm) / 5000;
}

/** Billing weight is the higher of actual and volumetric. */
export function computeApplicableWeightKg(actualKg: number, volumetricKg: number | null): number | null {
  if (!(actualKg > 0)) return null;
  const vol = volumetricKg != null && volumetricKg > 0 ? volumetricKg : 0;
  return Math.max(actualKg, vol);
}

export function chargedWeightSlabLabel(weightLabels: string[], weightKg: number): string {
  const idx = weightSlabIndex(weightLabels, weightKg);
  return weightLabels[idx] ?? `${weightKg} kg`;
}

export function parseWeightKgFromLabel(label: string): number {
  const n = Number(String(label).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Smallest slab with weightKg >= shipment weight, else largest slab. */
export function weightSlabIndex(weightLabels: string[], weightKg: number): number {
  if (!weightLabels.length) return 0;
  const parsed = weightLabels.map(parseWeightKgFromLabel);
  const idx = parsed.findIndex((w) => w >= weightKg);
  return idx === -1 ? parsed.length - 1 : idx;
}

/**
 * When weight exceeds all defined slabs, returns the last slab index and a multiplier
 * = ceil(weightKg / maxSlabKg). Otherwise returns the correct slab index and multiplier 1.
 *
 * Example: 628 kg, max slab = 10 kg  → { slabIdx: lastIdx, multiplier: 63 }
 */
export function weightSlabMultiplier(
  weightLabels: string[],
  weightKg: number
): { slabIdx: number; multiplier: number } {
  if (!weightLabels.length) return { slabIdx: 0, multiplier: 1 };
  const parsed = weightLabels.map(parseWeightKgFromLabel);
  const idx = parsed.findIndex((w) => w >= weightKg);
  if (idx !== -1) return { slabIdx: idx, multiplier: 1 };
  // Weight exceeds all slabs
  const maxSlabKg = parsed[parsed.length - 1] || 1;
  const multiplier = Math.ceil(weightKg / maxSlabKg);
  return { slabIdx: parsed.length - 1, multiplier };
}

export function normalizeZoneCode(zone: string): string {
  return String(zone ?? "")
    .trim()
    .toUpperCase()
    .replace(/^ZONE\s*/i, "");
}

export function rateForZoneWeight(
  rates: number[][],
  zones: string[],
  zone: string,
  weightKg: number,
  weightLabels: string[]
): number | null {
  const zi = zones.findIndex((z) => normalizeZoneCode(z) === normalizeZoneCode(zone));
  if (zi < 0) return null;
  const wi = weightSlabIndex(weightLabels, weightKg);
  const val = rates[zi]?.[wi];
  return val != null && Number.isFinite(Number(val)) ? Number(val) : null;
}

export function formatRateAmount(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export function parseRateCellInput(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export const SHIPPING_RATE_CARD_REFETCH_EVENT = "shipamaze:refetch:shipping-rate-card";
export const SHIPPING_RATE_CARD_STORAGE_KEY = "shipamaze:shipping-rate-card-updated";

export function notifyShippingRateCardUpdated() {
  window.dispatchEvent(new Event(SHIPPING_RATE_CARD_REFETCH_EVENT));
  try {
    localStorage.setItem(SHIPPING_RATE_CARD_STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore quota / private mode */
  }
}
