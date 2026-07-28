import type { Order } from "@/types/logistics";

/**
 * Client-side tab matching — mirrors backend buildTabQuery in orderFilters.ts.
 * Used for badge count fallback; the API tab param is the source of truth for the list.
 */

export function normalizeTabStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const FULFILLMENT_PIPELINE = new Set([
  "ready_to_ship",
  "ready_for_pickup",
  "pending_pickup",
  "pickup_scheduled",
  "not_picked",
  "picked_up",
  "in_transit",
  "shipped",
  "dispatched",
  "connected",
  "bagged",
  "out_for_delivery",
  "delivered",
  "failed",
  "ndr",
  "rto",
  "reship",
  "cancelled",
]);

const READY_TO_SHIP_STATUSES = new Set([
  "ready_to_ship",
  "ready-to-ship",
  "ready to ship",
  "awaiting_shipment",
]);
const PENDING_PICKUP_STATUSES = new Set([
  "pending_pickup",
  "pickup_scheduled",
  "ready_for_pickup",
  "not_picked",
]);
const IN_TRANSIT_STATUSES = new Set([
  "in_transit",
  "shipped",
  "picked_up",
  "dispatched",
  "connected",
  "bagged",
]);
const FAILED_STATUSES = new Set([
  "failed",
  "ndr",
  "ndr_raised",
  "need_attention",
  "needs_attention",
  "reattempt_delivery",
]);
const OUT_FOR_DELIVERY_STATUSES = new Set(["out_for_delivery"]);

const STATUS_RANK: Record<string, number> = {
  pending: 5,
  draft: 5,
  ready_to_ship: 10,
  pending_pickup: 20,
  pickup_scheduled: 20,
  ready_for_pickup: 20,
  not_picked: 20,
  picked_up: 30,
  in_transit: 35,
  shipped: 35,
  dispatched: 35,
  connected: 35,
  bagged: 35,
  out_for_delivery: 45,
  failed: 50,
  ndr: 50,
  rto: 60,
  cancelled: 60,
  delivered: 70,
};

function laterStatus(a: string, b: string): string {
  return (STATUS_RANK[b] ?? 0) > (STATUS_RANK[a] ?? 0) ? b : a;
}

/** Highest pipeline status from order.status vs order.shipmentStatus (mirrors tab matching). */
export function orderEffectiveStatus(o: Order): string {
  const st = normalizeTabStatus(o.status);
  const shipmentSt = normalizeTabStatus(o.shipmentStatus);
  return laterStatus(st, shipmentSt);
}

/** True when the order belongs in Ready to Ship (no AWB yet). */
export function isOrderReadyToShip(o: Order): boolean {
  if (Boolean(o.isJunk)) return false;
  if (normalizeTabStatus(o.status) === "reship") return false;
  const hasAwb = Boolean(String(o.awb ?? "").trim());
  if (hasAwb) return false;
  return READY_TO_SHIP_STATUSES.has(orderEffectiveStatus(o));
}

export function isChannelOrder(o: Order): boolean {
  const channel = String(o.channel ?? "");
  const externalSource = String(o.externalSource ?? "").toLowerCase();
  if (channel === "Shopify" || externalSource === "shopify") return true;
  if (externalSource && externalSource !== "manual") return true;
  return Boolean(channel && channel !== "Manual");
}

export function orderMatchesTab(o: Order, tab: string): boolean {
  const st = normalizeTabStatus(o.status);
  const shipmentSt = normalizeTabStatus(o.shipmentStatus);
  const effectiveSt = orderEffectiveStatus(o);
  const isReship = st === "reship";
  const isJunk = Boolean(o.isJunk);
  const hasAwb = Boolean(String(o.awb ?? "").trim());
  const shipmentCreated = Boolean(o.shipmentCreated);
  const hasFulfillmentStatus = FULFILLMENT_PIPELINE.has(st) || FULFILLMENT_PIPELINE.has(shipmentSt);
  const isPreFulfillment = !hasFulfillmentStatus && !hasAwb && !shipmentCreated;

  switch (tab) {
    case "all":
      return true;
    case "channel":
      return isChannelOrder(o) && !isJunk && !isReship && isPreFulfillment;
    case "manual":
      return !isChannelOrder(o) && !isJunk && !isReship && isPreFulfillment;
    case "ready-to-ship":
      return !isJunk && !isReship && READY_TO_SHIP_STATUSES.has(effectiveSt) && !hasAwb;
    case "pending-pickup":
      if (isJunk || isReship) return false;
      if (PENDING_PICKUP_STATUSES.has(effectiveSt)) return true;
      return hasAwb && READY_TO_SHIP_STATUSES.has(effectiveSt);
    case "in-transit":
      return !isJunk && !isReship && IN_TRANSIT_STATUSES.has(effectiveSt);
    case "out-for-delivery":
      return !isJunk && !isReship && OUT_FOR_DELIVERY_STATUSES.has(effectiveSt);
    case "delivered":
      return !isJunk && !isReship && effectiveSt === "delivered";
    case "reship":
      return isReship && !isJunk;
    case "failed":
      return !isJunk && !isReship && FAILED_STATUSES.has(effectiveSt);
    case "junk":
      return isJunk;
    default:
      return false;
  }
}
