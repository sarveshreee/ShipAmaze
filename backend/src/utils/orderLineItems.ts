/** Normalize line-item fields for consistent productName + sku storage across order arrays. */
export function normalizeLineItem(row: unknown): Record<string, unknown> {
  const o = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  const name = String(o.name ?? o.title ?? o.productName ?? "").trim();
  const sku = String(o.sku ?? o.productSku ?? o.SKU ?? "").trim();
  const qty = Number(o.qty ?? o.quantity ?? o.units ?? 1);
  const price = Number(o.price ?? o.sellingPrice ?? o.amount ?? 0);
  const out: Record<string, unknown> = { ...o, name, sku, qty, price };
  if (name) out.productName = name;
  return out;
}

export function normalizeLineItems(items: unknown[]): Record<string, unknown>[] {
  return items.map((row) => normalizeLineItem(row));
}

export function firstItemArrayFromOrderDoc(order: {
  orderItems?: unknown[];
  items?: unknown[];
  products?: unknown[];
  shopifyLineItems?: unknown[];
}): Record<string, unknown>[] {
  for (const arr of [order.orderItems, order.items, order.products, order.shopifyLineItems]) {
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map((row) => normalizeLineItem(row));
    }
  }
  return [];
}

export function syncOrderLineItemArrays(
  order: {
    products?: unknown[];
    items?: unknown[];
    orderItems?: unknown[];
    shopifyLineItems?: unknown[];
    markModified?: (path: string) => void;
  },
  normalized: Record<string, unknown>[]
) {
  order.products = normalized;
  order.items = normalized;
  order.orderItems = normalized;
  if (Array.isArray(order.shopifyLineItems) && order.shopifyLineItems.length > 0) {
    order.shopifyLineItems = normalized;
  }
  order.markModified?.("products");
  order.markModified?.("items");
  order.markModified?.("orderItems");
  order.markModified?.("shopifyLineItems");
}
