/**
 * Mappings between Velocity Shipping statuses and our internal system statuses.
 */

const velocityToInternalStatus: Record<string, string> = {
  pending: "pending",
  ready_for_pickup: "ready-to-ship",
  ready_to_ship: "ready-to-ship",
  pickup_scheduled: "pickup-scheduled",
  picked_up: "picked-up",
  pickedup: "picked-up",
  not_picked: "not-picked",
  in_transit: "in-transit",
  out_for_delivery: "out-for-delivery",
  delivered: "delivered",
  ndr_raised: "ndr",
  need_attention: "ndr",
  reattempt_delivery: "ndr",
  cancelled: "cancelled",
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

function normalizeInternalStatusKey(internalStatus: unknown): string {
  return String(internalStatus || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function mapVelocityStatus(velocityStatus: unknown): string {
  const raw = typeof velocityStatus === "string" ? velocityStatus : String(velocityStatus ?? "");
  const normalised = normalizeVelocityStatusKey(raw);
  return velocityToInternalStatus[normalised] ?? raw;
}

const TERMINAL_INTERNAL = new Set(["delivered", "cancelled", "rto"]);

/** Higher = later in typical forward journey (used to avoid status regression on sync). */
export function internalShipmentProgressRank(internalStatus: string): number {
  const s = normalizeInternalStatusKey(internalStatus);
  if (TERMINAL_INTERNAL.has(s)) return 100;
  if (s === "ndr") return 65;
  if (s === "out_for_delivery") return 55;
  if (s === "picked_up") return 48;
  if (s === "in_transit") return 45;
  if (s === "pickup_scheduled") return 38;
  if (s === "not_picked") return 36;
  if (s === "ready_to_ship") return 32;
  if (s === "pending") return 10;
  return 20;
}

/**
 * Returns true if we should update the order's main `status` from a Velocity poll.
 * Blocks downgrades after terminal states; allows forward progress and NDR oscillation within non-terminal band.
 */
export function shouldApplyInternalStatusUpdate(currentInternal: string, incomingMapped: string): boolean {
  const cur = normalizeInternalStatusKey(currentInternal);
  const inc = normalizeInternalStatusKey(incomingMapped);
  if (!inc) return false;
  if (inc === cur) return true;

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
  return labels[normalised] ?? raw;
}
