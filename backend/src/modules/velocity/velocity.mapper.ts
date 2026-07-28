/**
 * Mappings between Velocity Shipping statuses and our internal system statuses.
 */

import { normalizeOrderStatus } from "../../utils/orderStatus.js";

const velocityToInternalStatus: Record<string, string> = {
  pending: "pending",
  booked: "pickup-scheduled",
  manifested: "pickup-scheduled",
  shipment_booked: "pickup-scheduled",
  ready_for_pickup: "ready-to-ship",
  ready_to_ship: "ready-to-ship",
  pickup_scheduled: "pickup-scheduled",
  pending_pickup: "pickup-scheduled",
  picked_up: "picked-up",
  pickedup: "picked-up",
  pickup: "picked-up",
  not_picked: "not-picked",
  in_transit: "in-transit",
  intransit: "in-transit",
  shipment_in_transit: "in-transit",
  shipped: "in-transit",
  /** Common courier / Ekart / Velocity transit-like strings */
  dispatched: "in-transit",
  dispatch: "in-transit",
  connected: "in-transit",
  bagged: "in-transit",
  bagging: "in-transit",
  departed: "in-transit",
  left_origin: "in-transit",
  reached_destination_hub: "in-transit",
  reached_hub: "in-transit",
  at_hub: "in-transit",
  in_hub: "in-transit",
  hub_scan: "in-transit",
  scanned: "in-transit",
  received: "in-transit",
  arrival: "in-transit",
  arrived: "in-transit",
  out_for_delivery: "out-for-delivery",
  outfordelivery: "out-for-delivery",
  ofd: "out-for-delivery",
  delivered: "delivered",
  ndr_raised: "ndr",
  need_attention: "ndr",
  needs_attention: "ndr",
  reattempt_delivery: "ndr",
  undelivered: "ndr",
  cancelled: "cancelled",
  canceled: "cancelled",
  rejected: "cancelled",
  rto_initiated: "rto",
  rto_in_transit: "rto",
  rto_delivered: "rto",
  return_pickup_scheduled: "ready-to-ship",
  return_not_picked: "not-picked",
  return_in_transit: "in-transit",
  return_delivered: "delivered",
  return_cancelled: "cancelled",
  return_ndr_raised: "ndr",
};

function normalizeVelocityStatusKey(velocityStatus: unknown): string {
  const raw = typeof velocityStatus === "string" ? velocityStatus : String(velocityStatus ?? "");
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Heuristic for unmapped courier strings (Ekart / Delhivery / Velocity variants).
 * Prefer advancing to in-transit over leaving raw text that blocks tab upgrades.
 */
function inferUnmappedVelocityStatus(normalised: string): string | undefined {
  if (!normalised) return undefined;
  if (normalised.includes("cancel") || normalised.includes("reject")) return "cancelled";
  if (normalised.includes("rto") || (normalised.includes("return") && !normalised.includes("pickup"))) {
    return "rto";
  }
  if (
    normalised.includes("ndr") ||
    normalised.includes("undeliver") ||
    normalised.includes("failed_delivery") ||
    normalised.includes("delivery_failed")
  ) {
    return "ndr";
  }
  if (normalised.includes("deliver") && !normalised.includes("out")) return "delivered";
  if (normalised.includes("out_for") || normalised === "ofd" || normalised.includes("outfordelivery")) {
    return "out-for-delivery";
  }
  if (
    normalised.includes("transit") ||
    normalised.includes("dispatch") ||
    normalised.includes("ship") ||
    normalised.includes("bag") ||
    normalised.includes("connect") ||
    normalised.includes("hub") ||
    normalised.includes("scan") ||
    normalised.includes("reach") ||
    normalised.includes("arriv") ||
    normalised.includes("depart") ||
    normalised.includes("left_") ||
    normalised.includes("in_facility") ||
    normalised.includes("received_at")
  ) {
    return "in-transit";
  }
  if (normalised.includes("pick") && !normalised.includes("not") && !normalised.includes("schedul")) {
    return "picked-up";
  }
  return undefined;
}

export function mapVelocityStatus(velocityStatus: unknown): string {
  const raw = typeof velocityStatus === "string" ? velocityStatus : String(velocityStatus ?? "");
  const normalised = normalizeVelocityStatusKey(raw);
  if (velocityToInternalStatus[normalised]) return velocityToInternalStatus[normalised]!;
  const inferred = inferUnmappedVelocityStatus(normalised);
  if (inferred) return inferred;
  return raw;
}

const TERMINAL_INTERNAL = new Set(["delivered", "cancelled", "rto"]);

/** Higher = later in typical forward journey (used to avoid status regression on sync). */
export function internalShipmentProgressRank(internalStatus: string): number {
  // Always rank on canonical snake_case so "in-transit", "In Transit", "dispatched" compare correctly.
  const s = normalizeOrderStatus(internalStatus);
  if (TERMINAL_INTERNAL.has(s)) return 100;
  if (s === "ndr") return 65;
  if (s === "out_for_delivery") return 55;
  if (s === "picked_up") return 48;
  if (s === "in_transit") return 45;
  if (s === "pickup_scheduled") return 38;
  if (s === "ready_to_ship") return 32;
  if (s === "draft") return 10;
  return 20;
}

/**
 * Returns true if we should update the order's main `status` from a Velocity poll.
 * Blocks downgrades after terminal states; allows forward progress and NDR oscillation within non-terminal band.
 */
export function shouldApplyInternalStatusUpdate(currentInternal: string, incomingMapped: string): boolean {
  const cur = normalizeOrderStatus(currentInternal);
  const inc = normalizeOrderStatus(incomingMapped);
  if (!String(incomingMapped ?? "").trim()) return false;
  if (inc === cur) return true;

  // Unmapped garbage that collapses to draft must not overwrite real shipment progress.
  if (inc === "draft" && cur !== "draft") return false;

  if (TERMINAL_INTERNAL.has(cur) && !TERMINAL_INTERNAL.has(inc)) return false;

  const rCur = internalShipmentProgressRank(cur);
  const rInc = internalShipmentProgressRank(inc);
  if (TERMINAL_INTERNAL.has(inc)) return true;
  return rInc >= rCur;
}

/** Human-readable label for Velocity status codes */
export function velocityStatusLabel(velocityStatus: unknown): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    ready_for_pickup: "Ready for Pickup",
    pickup_scheduled: "Pickup Scheduled",
    ready_to_ship: "Ready to Ship",
    picked_up: "Picked Up",
    not_picked: "Not Picked",
    in_transit: "In Transit",
    dispatched: "In Transit",
    shipped: "In Transit",
    connected: "In Transit",
    bagged: "In Transit",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    ndr_raised: "NDR Raised",
    need_attention: "Needs Attention",
    reattempt_delivery: "NDR – Reattempt",
    cancelled: "Cancelled",
    rejected: "Rejected",
    rto_initiated: "RTO Initiated",
    rto_in_transit: "RTO In Transit",
    rto_delivered: "RTO Delivered",
    return_pickup_scheduled: "Return Pickup Scheduled",
    return_not_picked: "Return Not Picked",
    return_in_transit: "Return In Transit",
    return_delivered: "Return Delivered",
    return_cancelled: "Return Cancelled",
    return_ndr_raised: "Return NDR",
  };
  const raw = typeof velocityStatus === "string" ? velocityStatus : String(velocityStatus ?? "");
  const normalised = normalizeVelocityStatusKey(raw);
  if (labels[normalised]) return labels[normalised]!;
  const mapped = mapVelocityStatus(raw);
  if (mapped === "in-transit") return "In Transit";
  if (mapped === "picked-up") return "Picked Up";
  if (mapped === "out-for-delivery") return "Out for Delivery";
  return raw;
}
