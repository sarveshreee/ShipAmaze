/** Mirrors frontend pricing.ts — final price is computed, never stored over product cost. */

export function resolveProductCost(raw: Record<string, unknown>): number {
  const n = Number(raw.price ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveShippingCharge(raw: Record<string, unknown>): number {
  const val = raw.shippingCharge ?? raw.shipping_charge ?? raw.shippingCharges ?? 0;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function getFinalProductPrice(raw: Record<string, unknown>): number {
  return resolveProductCost(raw) + resolveShippingCharge(raw);
}
