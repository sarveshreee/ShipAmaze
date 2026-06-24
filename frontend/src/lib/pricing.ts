/** Product price fields (camelCase + snake_case). DB stores cost/commission separately; final is computed. */
export type ProductPriceFields = Record<string, unknown>;

export const DEFAULT_OUR_COMMISSION = 40;

/** Base product cost stored as `price` (never overwritten for display math). */
export function resolveProductCost(raw: ProductPriceFields): number {
  const n = Number(raw.price ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Per-product shipping charge; missing/null/invalid → 0. */
export function resolveShippingCharge(raw: ProductPriceFields): number {
  const val = raw.shippingCharge ?? raw.shipping_charge ?? raw.shippingCharges ?? 0;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Platform commission added to product cost; missing/null/invalid → ₹40. */
export function resolveOurCommission(raw: ProductPriceFields): number {
  const val = raw.ourCommission ?? raw.our_commission ?? raw.commission ?? DEFAULT_OUR_COMMISSION;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_OUR_COMMISSION;
}

/** finalPrice = productCost + ourCommission */
export function getFinalProductPrice(raw: ProductPriceFields): number {
  return resolveProductCost(raw) + resolveOurCommission(raw);
}

/** Variant unit price + commission (variant commission overrides product when set). */
export function getFinalVariantPrice(
  variant: ProductPriceFields,
  product?: ProductPriceFields,
): number {
  const cost = Number(variant.price ?? 0);
  const base = Number.isFinite(cost) && cost >= 0 ? cost : 0;
  const variantCommission = resolveOurCommission(variant);
  const commission = variant.ourCommission != null || variant.our_commission != null || product == null
    ? variantCommission
    : resolveOurCommission(product);
  return base + commission;
}

/** Order/label line item: unit cost + line shipping snapshot (if any). */
export function getFinalLineItemUnitPrice(line: ProductPriceFields): number {
  const cost = Number(line.price ?? line.sellingPrice ?? line.amount ?? 0);
  const base = Number.isFinite(cost) && cost >= 0 ? cost : 0;
  return base + resolveShippingCharge(line);
}

export function getFinalLineItemRowTotal(line: ProductPriceFields): number {
  const q = Number(line.qty ?? line.quantity ?? line.units ?? 1) || 1;
  const unit = getFinalLineItemUnitPrice(line);
  return Math.round(unit * q * 100) / 100;
}

export function formatProductPriceInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
