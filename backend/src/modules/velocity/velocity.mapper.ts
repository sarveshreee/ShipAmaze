/**
 * Mappings between Velocity Shipping statuses and our internal system statuses.
 */

const velocityToInternalStatus: Record<string, string> = {
  pending: "pending",
  ready_for_pickup: "ready-to-ship",
  pickup_scheduled: "ready-to-ship",
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

export function mapVelocityStatus(velocityStatus: string): string {
  const normalised = velocityStatus?.toLowerCase().replace(/\s+/g, "_").trim();
  return velocityToInternalStatus[normalised] ?? velocityStatus;
}

/** Human-readable label for Velocity status codes */
export function velocityStatusLabel(velocityStatus: string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    ready_for_pickup: "Ready for Pickup",
    pickup_scheduled: "Pickup Scheduled",
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
  const normalised = velocityStatus?.toLowerCase().replace(/\s+/g, "_").trim();
  return labels[normalised] ?? velocityStatus;
}
