/** Product price fields (camelCase + snake_case). DB stores cost/shipping separately; final is computed. */
export type ProductPriceFields = Record<string, unknown>;

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

/** finalPrice = productCost + shippingCharge */
export function getFinalProductPrice(raw: ProductPriceFields): number {
  return resolveProductCost(raw) + resolveShippingCharge(raw);
}

/** Variant unit price + shipping (variant shipping overrides product when set). */
export function getFinalVariantPrice(
  variant: ProductPriceFields,
  product?: ProductPriceFields,
): number {
  const cost = Number(variant.price ?? 0);
  const base = Number.isFinite(cost) && cost >= 0 ? cost : 0;
  const variantShipping = resolveShippingCharge(variant);
  const shipping = variantShipping > 0 || product == null ? variantShipping : resolveShippingCharge(product);
  return base + shipping;
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
