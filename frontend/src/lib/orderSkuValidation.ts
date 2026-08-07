import type { Order } from "@/types/logistics";

/** Line items from any supported order array field. */
export function getOrderLineItems(o: Order): Array<{ sku?: string }> {
  const items = o.orderItems ?? o.products ?? o.items ?? [];
  return Array.isArray(items) ? items : [];
}

/** True when any line item is missing a non-empty SKU. */
export function orderMissingSku(o: Order): boolean {
  const items = getOrderLineItems(o);
  if (items.length === 0) return true;
  return items.some((row) => !String(row.sku ?? "").trim());
}

/** Collect business order IDs missing SKU from a list. */
export function ordersMissingSku(orderIds: string[], orders: Order[]): string[] {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const missing: string[] = [];
  for (const id of orderIds) {
    const o = byId.get(id);
    if (!o || orderMissingSku(o)) {
      missing.push(o?.orderId ?? id);
    }
  }
  return missing;
}
