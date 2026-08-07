/** Canonical lifecycle statuses (snake_case). Legacy hyphen/alias values are normalized to these. */
export const ORDER_STATUSES = [
  "draft",
  "ready_to_ship",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ndr",
  "rto",
  "pickup_failed",
  "processing_failed",
  "cancelled",
] as const;

export type OrderCanonicalStatus = (typeof ORDER_STATUSES)[number];

const LEGACY_TO_CANONICAL: Record<string, OrderCanonicalStatus> = {
  pending: "draft",
  draft: "draft",
  "ready-to-ship": "ready_to_ship",
  ready_to_ship: "ready_to_ship",
  rts: "ready_to_ship",
  "on-process": "pickup_scheduled",
  "pending-pickup": "pickup_scheduled",
  pending_pickup: "pickup_scheduled",
  "ready-for-pickup": "pickup_scheduled",
  ready_for_pickup: "pickup_scheduled",
  "pickup-scheduled": "pickup_scheduled",
  "not-picked": "pickup_scheduled",
  pickup_scheduled: "pickup_scheduled",
  picked_up: "picked_up",
  "in-transit": "in_transit",
  in_transit: "in_transit",
  shipped: "in_transit",
  dispatched: "in_transit",
  dispatch: "in_transit",
  connected: "in_transit",
  bagged: "in_transit",
  "picked-up": "picked_up",
  "out-for-delivery": "out_for_delivery",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  ndr: "ndr",
  rto: "rto",
  cancelled: "cancelled",
  canceled: "cancelled",
  junk: "cancelled",
  failed: "processing_failed",
  processing_failed: "processing_failed",
  pickup_failed: "pickup_failed",
  booking_failed: "processing_failed",
  label_generation_failed: "processing_failed",
  courier_api_failed: "processing_failed",
  manifest_failed: "processing_failed",
  booking_rejected: "processing_failed",
  shipment_creation_failed: "processing_failed",
  shipment_lost: "processing_failed",
  pickup_cancelled: "processing_failed",
  reship: "ready_to_ship",
};

/** Normalize any stored/API status string to canonical snake_case. */
export function normalizeOrderStatus(raw: string | undefined | null): OrderCanonicalStatus {
  const s = String(raw ?? "draft")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  const mapped = LEGACY_TO_CANONICAL[s] ?? LEGACY_TO_CANONICAL[raw?.toString().trim().toLowerCase() ?? ""];
  if (mapped) return mapped;
  if ((ORDER_STATUSES as readonly string[]).includes(s)) return s as OrderCanonicalStatus;
  return "draft";
}

const TRANSITIONS: Record<OrderCanonicalStatus, Set<OrderCanonicalStatus>> = {
  draft: new Set(["ready_to_ship", "cancelled"]),
  ready_to_ship: new Set(["pickup_scheduled", "cancelled", "processing_failed", "pickup_failed"]),
  pickup_failed: new Set(["ready_to_ship", "cancelled"]),
  processing_failed: new Set(["ready_to_ship", "cancelled"]),
  pickup_scheduled: new Set(["picked_up", "in_transit", "cancelled"]),
  picked_up: new Set(["in_transit", "out_for_delivery", "cancelled"]),
  in_transit: new Set(["out_for_delivery", "delivered", "ndr", "rto", "cancelled"]),
  out_for_delivery: new Set(["delivered", "ndr", "rto", "cancelled"]),
  delivered: new Set([]),
  ndr: new Set(["in_transit", "ready_to_ship", "cancelled"]),
  rto: new Set(["cancelled"]),
  cancelled: new Set([]),
};

export function isValidStatusTransition(
  fromRaw: string,
  toRaw: string,
  opts: { role: string; isAdmin: boolean }
): { ok: boolean; message?: string } {
  if (opts.isAdmin) return { ok: true };
  const from = normalizeOrderStatus(fromRaw);
  const to = normalizeOrderStatus(toRaw);
  if (from === to) return { ok: true };
  const allowed = TRANSITIONS[from];
  if (!allowed) return { ok: false, message: `Unknown current status "${fromRaw}"` };
  if (allowed.has(to)) return { ok: true };
  return { ok: false, message: `Cannot change status from "${from}" to "${to}"` };
}
