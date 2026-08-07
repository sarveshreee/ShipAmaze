/**
 * Mappings between Velocity Shipping statuses and our internal system statuses.
 * Delegates normalization to orderStatusClassifier.
 */

import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import {
  internalStatusProgressRank as classifierProgressRank,
  normalizeTrackingStatus,
} from "../../utils/orderStatusClassifier.js";

/** Map Velocity raw status to hyphenated internal string (legacy sync format). */
export function mapVelocityStatus(velocityStatus: unknown): string {
  const internal = normalizeTrackingStatus(velocityStatus, "velocity");
  return internal.replace(/_/g, "-");
}

const TERMINAL_INTERNAL = new Set(["delivered", "cancelled", "rto"]);

/** Higher = later in typical forward journey (used to avoid status regression on sync). */
export function internalShipmentProgressRank(internalStatus: string): number {
  const key = normalizeTrackingStatus(internalStatus, "velocity");
  return classifierProgressRank(key);
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
    awaiting_shipment: "Awaiting Shipment",
    booked: "Booked",
    manifested: "Manifested",
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
    pickup_failed: "Pickup Failed",
    pickup_cancelled: "Pickup Cancelled",
    booking_failed: "Booking Failed",
    shipment_lost: "Shipment Lost",
    return_pickup_scheduled: "Return Pickup Scheduled",
    return_not_picked: "Return Not Picked",
    return_in_transit: "Return In Transit",
    return_delivered: "Return Delivered",
    return_cancelled: "Return Cancelled",
    return_ndr_raised: "Return NDR",
  };
  const raw = typeof velocityStatus === "string" ? velocityStatus : String(velocityStatus ?? "");
  const normalised = normalizeTrackingStatus(raw, "velocity");
  if (labels[normalised]) return labels[normalised]!;
  if (normalised === "in_transit") return "In Transit";
  if (normalised === "picked_up") return "Picked Up";
  if (normalised === "out_for_delivery") return "Out for Delivery";
  if (normalised === "processing_failed") return "Processing Failed";
  return raw;
}
