/**
 * Shared multi-provider status normalization.
 * Provider-specific strings are mapped here; Order.status stays ShipAmaze snake_case.
 */

import { normalizeOrderStatus, type OrderCanonicalStatus } from "../../utils/orderStatus.js";
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

export function mapLorrigoStatusToProviderCanonical(raw: unknown): ProviderCanonicalStatus {
  const k = key(raw);
  if (LORRIGO_RAW_TO_PROVIDER[k]) return LORRIGO_RAW_TO_PROVIDER[k];
  // Lorrigo variants like CANCELLED_ORDER / ORDER_CANCELLED
  if (k.includes("cancel")) return "CANCELLED";
  return "IN_TRANSIT";
}

export function providerCanonicalToOrderStatus(
  status: ProviderCanonicalStatus
): OrderCanonicalStatus {
  return PROVIDER_TO_ORDER[status];
}

export function mapProviderRawToOrderStatus(
  provider: "lorrigo" | "velocity",
  raw: unknown
): OrderCanonicalStatus {
  if (provider === "lorrigo") {
    return providerCanonicalToOrderStatus(mapLorrigoStatusToProviderCanonical(raw));
  }
  // Velocity callers should keep using mapVelocityStatus + normalizeOrderStatus.
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
