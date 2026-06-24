/** Mirrors frontend pricing.ts — final price is computed, never stored over product cost. */

export const DEFAULT_OUR_COMMISSION = 40;

export function resolveProductCost(raw: Record<string, unknown>): number {
  const n = Number(raw.price ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveShippingCharge(raw: Record<string, unknown>): number {
  const val = raw.shippingCharge ?? raw.shipping_charge ?? raw.shippingCharges ?? 0;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveOurCommission(raw: Record<string, unknown>): number {
  const val = raw.ourCommission ?? raw.our_commission ?? raw.commission ?? DEFAULT_OUR_COMMISSION;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_OUR_COMMISSION;
}

export function getFinalProductPrice(raw: Record<string, unknown>): number {
  return resolveProductCost(raw) + resolveOurCommission(raw);
}
