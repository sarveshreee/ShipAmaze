/**
 * Shared multi-provider status normalization.
 * Provider-specific strings are mapped here; Order.status stays ShipAmaze snake_case.
 */

import { normalizeOrderStatus, type OrderCanonicalStatus } from "../../utils/orderStatus.js";
import { normalizeTrackingStatus } from "../../utils/orderStatusClassifier.js";
import {
  shouldApplyInternalStatusUpdate,
  internalShipmentProgressRank,
} from "../velocity/velocity.mapper.js";

/** Provider-agnostic lifecycle labels (Phase 6 contract). */
export type ProviderCanonicalStatus =
  | "CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED"
  | "RETURNED"
  | "LOST";

const PROVIDER_TO_ORDER: Record<ProviderCanonicalStatus, OrderCanonicalStatus> = {
  CREATED: "pickup_scheduled",
  PICKED_UP: "picked_up",
  IN_TRANSIT: "in_transit",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  FAILED: "ndr",
  CANCELLED: "cancelled",
  RETURNED: "rto",
  LOST: "cancelled",
};

/** Terminal for polling — do not poll these. */
export const TERMINAL_PROVIDER_STATUSES = new Set<ProviderCanonicalStatus>([
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "LOST",
]);

export const TERMINAL_ORDER_STATUS_VALUES = [
  "delivered",
  "Delivered",
  "DELIVERED",
  "cancelled",
  "Cancelled",
  "CANCELLED",
  "canceled",
  "rto",
  "RTO",
  "rto_delivered",
  "RTO Delivered",
  "reship",
  "junk",
  "lost",
  "LOST",
  "returned",
  "RETURNED",
];

function key(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const LORRIGO_RAW_TO_PROVIDER: Record<string, ProviderCanonicalStatus> = {
  created: "CREATED",
  booked: "CREATED",
  manifested: "CREATED",
  pending: "CREATED",
  pickup_scheduled: "CREATED",
  ready_for_pickup: "CREATED",
  out_for_pickup: "CREATED",
  pickup_out_for_pickup: "CREATED",
  pickup_exception: "CREATED",
  pickupexception: "CREATED",
  picked_up: "PICKED_UP",
  pickedup: "PICKED_UP",
  pickup: "PICKED_UP",
  in_transit: "IN_TRANSIT",
  intransit: "IN_TRANSIT",
  shipped: "IN_TRANSIT",
  out_for_delivery: "OUT_FOR_DELIVERY",
  outfordelivery: "OUT_FOR_DELIVERY",
  ofd: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  failed: "FAILED",
  undelivered: "FAILED",
  ndr: "FAILED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  cancellation: "CANCELLED",
  cancelled_order: "CANCELLED",
  canceled_order: "CANCELLED",
  order_cancelled: "CANCELLED",
  order_canceled: "CANCELLED",
  shipment_cancelled: "CANCELLED",
  shipment_canceled: "CANCELLED",
  cancel: "CANCELLED",
  returned: "RETURNED",
  rto: "RETURNED",
  rto_delivered: "RETURNED",
  lost: "LOST",
};

/**
 * Ekart Durin history / Critical Updates statuses → provider canonical.
 * Prefer machine `history[].status` codes from TrackResponseV2.
 */
const EKART_RAW_TO_PROVIDER: Record<string, ProviderCanonicalStatus> = {
  ...LORRIGO_RAW_TO_PROVIDER,
  created: "CREATED",
  shipment_created: "CREATED",
  request_received: "CREATED",
  shipment_details_received: "CREATED",
  details_received: "CREATED",
  scheduled: "CREATED",
  pickup_out_for_pickup: "CREATED",
  out_for_pickup: "CREATED",
  pickup_reattempt: "CREATED",
  lpd_generated: "CREATED",
  accepted: "CREATED",
  updated: "CREATED",
  pickup_complete: "PICKED_UP",
  shipment_pickup_complete: "PICKED_UP",
  picked: "PICKED_UP",
  received: "IN_TRANSIT",
  mh_received: "IN_TRANSIT",
  expected: "IN_TRANSIT",
  shipment_expected: "IN_TRANSIT",
  received_at_dh: "IN_TRANSIT",
  shipped: "IN_TRANSIT",
  shipment_shipped: "IN_TRANSIT",
  shipment_received: "IN_TRANSIT",
  in_transit: "IN_TRANSIT",
  misrouted: "IN_TRANSIT",
  out_for_delivery: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  undelivered_attempted: "FAILED",
  undelivered_unattempted: "FAILED",
  delivery_attempt_metadata: "FAILED",
  rejected: "FAILED",
  not_picked: "FAILED",
  pickup_cancelled: "CANCELLED",
  cancelled: "CANCELLED",
  shipment_cancelled: "CANCELLED",
  shipment_canceled: "CANCELLED",
  cancelled_by_seller: "CANCELLED",
  canceled_by_seller: "CANCELLED",
  cancel_request_raised: "CANCELLED",
  return_received: "RETURNED",
  return_expected: "RETURNED",
  return_received_at_dh: "RETURNED",
  return_out_for_delivery: "RETURNED",
  return_undelivered_attempted: "RETURNED",
  return_undelivered_unattempted: "RETURNED",
  return_delivered: "RETURNED",
  return_rejected_by_seller: "RETURNED",
  return_lost: "LOST",
  rto_created: "RETURNED",
  rto_completed: "RETURNED",
  rto_cancelled: "CANCELLED",
};

export function mapLorrigoStatusToProviderCanonical(raw: unknown): ProviderCanonicalStatus {
  const k = key(raw);
  if (LORRIGO_RAW_TO_PROVIDER[k]) return LORRIGO_RAW_TO_PROVIDER[k];
  if (k.includes("cancel")) return "CANCELLED";
  return "IN_TRANSIT";
}

export function mapEkartStatusToProviderCanonical(raw: unknown): ProviderCanonicalStatus {
  const k = key(raw);
  if (EKART_RAW_TO_PROVIDER[k]) return EKART_RAW_TO_PROVIDER[k];
  if (k.includes("cancel")) return "CANCELLED";
  // NDR / failed attempt — must run before the broad "deliver" match
  // ("undelivered_*" contains "deliver" and was incorrectly mapped to DELIVERED).
  if (
    k.includes("undeliver") ||
    k.includes("delivery_attempt") ||
    k.includes("delivery_exception") ||
    (k.includes("attempt") && k.includes("deliver"))
  ) {
    return "FAILED";
  }
  if (k.includes("rto") || (k.includes("return") && !k.includes("pickup"))) return "RETURNED";
  if (
    k.includes("deliver") &&
    !k.includes("out") &&
    !k.includes("un") &&
    !k.includes("fail") &&
    !k.includes("except") &&
    !k.includes("attempt") &&
    !k.includes("return") &&
    !k.includes("metadata")
  ) {
    return "DELIVERED";
  }
  // Pickup confirmed — including public text like "Shipment Picked Up".
  if (
    (k.includes("pickup") &&
      (k.includes("complete") || k.includes("done") || k.includes("success"))) ||
    (k.includes("picked") && !k.includes("not") && !k.includes("except"))
  ) {
    return "PICKED_UP";
  }
  if (k.includes("out_for_delivery") || k.includes("ofd")) return "OUT_FOR_DELIVERY";
  if (
    k.includes("out_for_pickup") ||
    k.includes("pickup_out_for_pickup") ||
    k.includes("pickup_exception") ||
    k.includes("pickup_reattempt") ||
    k.includes("ready_for_pickup")
  ) {
    return "CREATED";
  }
  if (
    k.includes("created") ||
    k.includes("scheduled") ||
    k.includes("request_received") ||
    k.includes("details_received")
  ) {
    return "CREATED";
  }
  if (
    k.includes("transit") ||
    k.includes("shipped") ||
    k.includes("mh_received") ||
    k.includes("received_at") ||
    k.includes("dispatched") ||
    k.includes("bagged") ||
    k.includes("connected") ||
    // Durin "Shipment Expected" / "expected" = parcel in network (In Transit)
    (k.includes("expected") && !k.includes("return"))
  ) {
    return "IN_TRANSIT";
  }
  // Unknown Durin codes stay at origin — do not skip Pending Pickup.
  return "CREATED";
}

export function providerCanonicalToOrderStatus(
  status: ProviderCanonicalStatus
): OrderCanonicalStatus {
  return PROVIDER_TO_ORDER[status];
}

export function mapProviderRawToOrderStatus(
  provider: "lorrigo" | "velocity" | "ekart",
  raw: unknown
): OrderCanonicalStatus {
  const classified = normalizeTrackingStatus(raw, provider);
  const fromClassifier = normalizeOrderStatus(classified);
  if (fromClassifier !== "draft" || !String(raw ?? "").trim()) {
    return fromClassifier;
  }
  if (provider === "lorrigo") {
    return providerCanonicalToOrderStatus(mapLorrigoStatusToProviderCanonical(raw));
  }
  if (provider === "ekart") {
    return providerCanonicalToOrderStatus(mapEkartStatusToProviderCanonical(raw));
  }
  return normalizeOrderStatus(String(raw ?? ""));
}

export function shouldApplyStatusUpdate(current: string, incoming: string): boolean {
  return shouldApplyInternalStatusUpdate(current, incoming);
}

export function statusProgressRank(status: string): number {
  return internalShipmentProgressRank(status);
}

export function isTerminalOrderStatus(status: string): boolean {
  const n = normalizeOrderStatus(status);
  return n === "delivered" || n === "cancelled" || n === "rto";
}
