import type { Order } from "@/types/logistics";
import {
  effectiveInternalStatus,
  isChannelSource,
  normalizeTrackingStatus,
  orderMatchesTabCategory,
  READY_TO_SHIP_INTERNAL_KEYS,
} from "@/lib/orderStatusClassifier";

/**
 * Client-side tab matching — mirrors backend buildTabQuery in orderFilters.ts.
 * Used for badge count fallback; the API tab param is the source of truth for the list.
 */

export function normalizeTabStatus(raw: unknown): string {
  return normalizeTrackingStatus(raw);
}

/** Highest pipeline status from order.status vs order.shipmentStatus (mirrors tab matching). */
export function orderEffectiveStatus(o: Order): string {
  return effectiveInternalStatus(o.status, o.shipmentStatus, o.courierProvider);
}

/** True when the order belongs in Ready to Ship (no AWB yet). */
export function isOrderReadyToShip(o: Order): boolean {
  if (Boolean(o.isJunk)) return false;
  if (normalizeTrackingStatus(o.status) === "reship") return false;
  const hasAwb = Boolean(String(o.awb ?? "").trim());
  if (hasAwb) return false;
  const effective = orderEffectiveStatus(o);
  return (READY_TO_SHIP_INTERNAL_KEYS as readonly string[]).includes(effective);
}

export function isChannelOrder(o: Order): boolean {
  return isChannelSource(o);
}

export function orderMatchesTab(o: Order, tab: string): boolean {
  return orderMatchesTabCategory(
    {
      status: o.status,
      shipmentStatus: o.shipmentStatus,
      awb: o.awb,
      isJunk: o.isJunk,
      shipmentCreated: o.shipmentCreated,
      externalSource: o.externalSource,
      channel: o.channel,
      courierProvider: o.courierProvider,
    },
    tab
  );
}
