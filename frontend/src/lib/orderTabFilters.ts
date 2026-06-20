import type { Order } from "@/types/logistics";

/**
 * Client-side tab matching — mirrors backend buildTabQuery in orderFilters.ts.
 * Used for badge count fallback; the API tab param is the source of truth for the list.
 */

export function normalizeTabStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

const FULFILLMENT_PIPELINE = new Set([
  "ready_to_ship",
  "pending_pickup",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "shipped",
  "out_for_delivery",
  "delivered",
  "failed",
  "ndr",
  "rto",
  "reship",
]);

const IN_TRANSIT_STATUSES = new Set(["in_transit", "shipped", "picked_up"]);
const FAILED_STATUSES = new Set(["failed", "ndr", "not_picked"]);
const OUT_FOR_DELIVERY_STATUSES = new Set(["out_for_delivery"]);

export function isChannelOrder(o: Order): boolean {
  const channel = String(o.channel ?? "");
  const externalSource = String(o.externalSource ?? "").toLowerCase();
  if (channel === "Shopify" || externalSource === "shopify") return true;
  if (externalSource && externalSource !== "manual") return true;
  return Boolean(channel && channel !== "Manual");
}

export function orderMatchesTab(o: Order, tab: string): boolean {
  const st = normalizeTabStatus(o.status);
  const isReship = st === "reship";
  const isJunk = Boolean(o.isJunk);
  const hasAwb = Boolean(String(o.awb ?? "").trim());
  const shipmentCreated = Boolean(o.shipmentCreated);
  const isPreFulfillment = !FULFILLMENT_PIPELINE.has(st) && !hasAwb && !shipmentCreated;

  switch (tab) {
    case "all":
      return true;
    case "channel":
      return isChannelOrder(o) && !isJunk && !isReship && isPreFulfillment;
    case "manual":
      return !isChannelOrder(o) && !isJunk && !isReship && isPreFulfillment;
    case "ready-to-ship":
      return !isJunk && !isReship && st === "ready_to_ship" && !hasAwb;
    case "pending-pickup":
      if (isJunk || isReship) return false;
      if (st === "pending_pickup" || st === "pickup_scheduled") return true;
      return hasAwb && st === "ready_to_ship";
    case "in-transit":
      return !isJunk && !isReship && IN_TRANSIT_STATUSES.has(st);
    case "out-for-delivery":
      return !isJunk && !isReship && OUT_FOR_DELIVERY_STATUSES.has(st);
    case "delivered":
      return !isJunk && !isReship && st === "delivered";
    case "reship":
      return isReship && !isJunk;
    case "failed":
      return !isJunk && !isReship && FAILED_STATUSES.has(st);
    case "junk":
      return isJunk;
    default:
      return false;
  }
}
