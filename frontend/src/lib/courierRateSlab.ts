import type { CourierWeightSlab } from "@/services/courierRateService";

/** Pick the smallest slab with weightKg >= shipment weight, else the largest slab. */
export function resolveSlabRate(
  slabs: CourierWeightSlab[],
  weightKg: number,
  payment: "prepaid" | "cod"
): number {
  if (!slabs.length || !(weightKg > 0)) return 0;
  const sorted = [...slabs].sort((a, b) => a.weightKg - b.weightKg);
  const slab = sorted.find((s) => s.weightKg >= weightKg) ?? sorted[sorted.length - 1]!;
  const base = payment === "cod" ? (slab.codRate ?? slab.prepaidRate) : slab.prepaidRate;
  return Number.isFinite(base) ? base : 0;
}
