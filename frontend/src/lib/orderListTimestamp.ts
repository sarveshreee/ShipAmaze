import type { Order } from "@/types/logistics";
import { effectiveInternalStatus } from "./orderStatusClassifier";

export type OrderDateType = "choose" | "placed" | "pickup" | "delivered";

function normalizeStatusKey(status: unknown): string {
  return String(status ?? "")
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
}

function validDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function latestStatusTime(order: Order, statuses: string[]): Date | null {
  const wanted = new Set(statuses.map(normalizeStatusKey));
  const matches = (order.statusHistory ?? [])
    .filter((event) => wanted.has(normalizeStatusKey(event.status)))
    .map((event) => validDate(event.at))
    .filter((date): date is Date => Boolean(date));
  if (matches.length === 0) return null;
  return matches.reduce((latest, date) => (date > latest ? date : latest), matches[0]);
}

function earliestStatusTime(order: Order, statuses: string[]): Date | null {
  const wanted = new Set(statuses.map(normalizeStatusKey));
  const matches = (order.statusHistory ?? [])
    .filter((event) => wanted.has(normalizeStatusKey(event.status)))
    .map((event) => validDate(event.at))
    .filter((date): date is Date => Boolean(date));
  if (matches.length === 0) return null;
  return matches.reduce((earliest, date) => (date < earliest ? date : earliest), matches[0]);
}

/** First process / AWB generation time (Date Type → Placed). */
export function orderProcessedAt(order: Order): Date | null {
  return (
    validDate(order.assignedDateTime) ??
    earliestStatusTime(order, [
      "pending_pickup",
      "pending-pickup",
      "shipment_booked",
      "pickup_scheduled",
      "pickup-scheduled",
      "ready_for_pickup",
    ]) ??
    validDate(order.movedToReadyAt) ??
    null
  );
}

/** Actual courier pick-up / in-transit time (Date Type → Pickup). */
export function orderPickedUpAt(order: Order): Date | null {
  return (
    validDate(order.pickupDate) ??
    earliestStatusTime(order, ["picked_up", "picked-up"]) ??
    earliestStatusTime(order, ["in_transit", "in-transit"]) ??
    null
  );
}

/**
 * Timestamp shown on the order row for the active tab / date-type filter.
 * List sorting must use this same value so date→time descending matches the UI.
 */
export function orderTimestampForTab(
  order: Order,
  activeTab?: string,
  dateType?: OrderDateType
): { label: string; date: Date | null } {
  const createdAt = validDate(order.createdAt) ?? validDate(order.date) ?? validDate(order.updatedAt);

  if (dateType === "placed") {
    return { label: "Placed", date: orderProcessedAt(order) };
  }
  if (dateType === "pickup") {
    return { label: "Pickup", date: orderPickedUpAt(order) };
  }
  if (dateType === "delivered") {
    return {
      label: "Delivered",
      date: latestStatusTime(order, ["delivered"]) ?? null,
    };
  }

  // Show the real lifecycle label when status/shipmentStatus advanced past the viewing tab.
  const effective = effectiveInternalStatus(
    order.status,
    order.shipmentStatus,
    order.courierProvider
  );
  if (effective === "ndr") {
    return {
      label: "NDR",
      date:
        latestStatusTime(order, [
          "ndr",
          "undelivered_attempted",
          "undelivered_unattempted",
          "delivery_failed",
          "need_attention",
        ]) ?? createdAt,
    };
  }
  if (effective === "rto") {
    return {
      label: "RTO",
      date: latestStatusTime(order, ["rto", "rto_initiated", "returned"]) ?? createdAt,
    };
  }
  if (effective === "delivered") {
    return { label: "Delivered", date: latestStatusTime(order, ["delivered"]) ?? createdAt };
  }
  if (effective === "out_for_delivery") {
    return {
      label: "Out For Delivery",
      date: latestStatusTime(order, ["out_for_delivery", "out-for-delivery"]) ?? createdAt,
    };
  }
  if (effective === "in_transit" || effective === "picked_up") {
    return { label: "In Transit", date: orderPickedUpAt(order) ?? createdAt };
  }

  const tab = normalizeStatusKey(activeTab);

  if (tab === "pending_pickup") {
    return {
      label: "Pending Pickup",
      date:
        orderProcessedAt(order) ??
        latestStatusTime(order, [
          "pending_pickup",
          "pending-pickup",
          "pickup_scheduled",
          "pickup-scheduled",
          "ready_for_pickup",
          "not_picked",
        ]) ??
        createdAt,
    };
  }

  if (tab === "in_transit") {
    return {
      label: "In Transit",
      date: orderPickedUpAt(order) ?? createdAt,
    };
  }

  if (tab === "out_for_delivery") {
    return {
      label: "Out For Delivery",
      date: latestStatusTime(order, ["out_for_delivery", "out-for-delivery"]) ?? createdAt,
    };
  }

  if (tab === "delivered") {
    return {
      label: "Delivered",
      date: latestStatusTime(order, ["delivered"]) ?? createdAt,
    };
  }

  if (tab === "failed" || tab === "ndr" || tab === "rto") {
    return {
      label: tab === "ndr" ? "NDR" : tab === "rto" ? "RTO" : "Failed",
      date:
        latestStatusTime(order, ["failed", "rto", "ndr", "cancelled", "booking_failed"]) ??
        createdAt,
    };
  }

  return { label: "Created", date: createdAt };
}

/** Milliseconds for newest-first list sorting (date, then time). */
export function orderListSortMs(
  order: Order,
  activeTab?: string,
  dateType?: OrderDateType
): number {
  const d = orderTimestampForTab(order, activeTab, dateType).date;
  return d ? d.getTime() : 0;
}

export function sortOrdersNewestFirst<T extends Order>(
  orders: T[],
  activeTab?: string,
  dateType?: OrderDateType
): T[] {
  return [...orders].sort(
    (a, b) =>
      orderListSortMs(b, activeTab, dateType) - orderListSortMs(a, activeTab, dateType) ||
      String(b.id).localeCompare(String(a.id))
  );
}
