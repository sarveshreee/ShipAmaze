/**
 * Central order status classification for tabs, courier sync, and filtering.
 * Normalizes Velocity / Lorrigo / Ekart tracking strings into internal keys,
 * then maps to dashboard tab categories.
 */

export type OrderTabCategory =
  | "all"
  | "channel"
  | "manual"
  | "ready_to_ship"
  | "pending_pickup"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "reship"
  | "failed"
  | "ndr"
  | "rto"
  | "junk";

export type CourierProviderId = "velocity" | "lorrigo" | "ekart";

/** Normalize any raw status string to snake_case internal key. */
export function normalizeTrackingKey(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const withBoundaries = s.replace(/([a-z])([A-Z])/g, "$1_$2");
  return withBoundaries
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Build common DB / API string variants for Mongo $in queries. */
export function statusMatchVariants(internalKey: string): string[] {
  if (!internalKey) return [];
  const out = new Set<string>();
  out.add(internalKey);
  out.add(internalKey.replace(/_/g, "-"));
  out.add(internalKey.replace(/_/g, " "));
  const title = internalKey
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
  out.add(title);
  out.add(internalKey.toUpperCase());
  out.add(title.replace(/ /g, "-"));
  // Common courier title variants (e.g. RTO Initiated, In-transit)
  if (internalKey.startsWith("rto_")) {
    out.add(
      "RTO " +
        internalKey
          .slice(4)
          .split("_")
          .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
          .join(" ")
    );
  }
  if (internalKey === "in_transit") {
    out.add("In-transit");
  }
  return [...out];
}

function variantsForKeys(keys: readonly string[]): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    for (const v of statusMatchVariants(k)) out.add(v);
  }
  return [...out];
}

/** Internal keys that belong in Ready to Ship (pre-pickup, not yet collected). */
export const READY_TO_SHIP_INTERNAL_KEYS = [
  "ready_to_ship",
  "awaiting_shipment",
  "booked",
  "manifested",
  "pickup_pending",
] as const;

/** Internal keys for Pending Pickup tab. */
export const PENDING_PICKUP_INTERNAL_KEYS = [
  "pending_pickup",
  "pickup_scheduled",
  "ready_for_pickup",
  "out_for_pickup",
  "pickup_out_for_pickup",
  "not_picked",
] as const;

/** Internal keys for In Transit tab. */
export const IN_TRANSIT_INTERNAL_KEYS = [
  "in_transit",
  "shipped",
  "picked_up",
  "dispatched",
  "connected",
  "bagged",
] as const;

export const OUT_FOR_DELIVERY_INTERNAL_KEYS = ["out_for_delivery"] as const;
export const DELIVERED_INTERNAL_KEYS = ["delivered"] as const;

/** Genuine processing / booking failures — Failed tab only. */
export const PROCESSING_FAILED_INTERNAL_KEYS = [
  "processing_failed",
  "pickup_failed",
  "pickup_exception",
  "booking_failed",
  "label_generation_failed",
  "courier_api_failed",
  "manifest_failed",
  "booking_rejected",
  "shipment_creation_failed",
  "shipment_lost",
  "pickup_cancelled",
] as const;

/** NDR / delivery exception — NDR tab. */
export const NDR_INTERNAL_KEYS = [
  "ndr",
  "ndr_raised",
  "customer_not_available",
  "customer_refused",
  "address_incomplete",
  "address_issue",
  "door_locked",
  "phone_unreachable",
  "delivery_attempt_failed",
  "consignee_shifted",
  "reattempt_required",
  "delivery_exception",
  "need_attention",
  "needs_attention",
  "reattempt_delivery",
  "undelivered",
] as const;

/** Return journey — RTO tab. */
export const RTO_INTERNAL_KEYS = [
  "rto",
  "rto_initiated",
  "rto_in_transit",
  "rto_dispatched",
  "rto_out_for_delivery",
  "rto_delivered",
  "returned",
  "return_received",
  "shipment_returned",
  "return_complete",
  "return_in_transit",
  "return_delivered",
] as const;

export const READY_TO_SHIP_MATCH_VALUES = variantsForKeys(READY_TO_SHIP_INTERNAL_KEYS);
export const PENDING_PICKUP_MATCH_VALUES = variantsForKeys(PENDING_PICKUP_INTERNAL_KEYS);
export const IN_TRANSIT_MATCH_VALUES = variantsForKeys(IN_TRANSIT_INTERNAL_KEYS);
export const OUT_FOR_DELIVERY_MATCH_VALUES = variantsForKeys(OUT_FOR_DELIVERY_INTERNAL_KEYS);
export const DELIVERED_MATCH_VALUES = variantsForKeys(DELIVERED_INTERNAL_KEYS);
export const PROCESSING_FAILED_MATCH_VALUES = variantsForKeys(PROCESSING_FAILED_INTERNAL_KEYS);
export const NDR_MATCH_VALUES = variantsForKeys(NDR_INTERNAL_KEYS);
export const RTO_MATCH_VALUES = variantsForKeys(RTO_INTERNAL_KEYS);

const FULFILLMENT_PIPELINE_INTERNAL = [
  ...READY_TO_SHIP_INTERNAL_KEYS,
  ...PENDING_PICKUP_INTERNAL_KEYS,
  ...IN_TRANSIT_INTERNAL_KEYS,
  ...OUT_FOR_DELIVERY_INTERNAL_KEYS,
  ...DELIVERED_INTERNAL_KEYS,
  ...PROCESSING_FAILED_INTERNAL_KEYS,
  ...NDR_INTERNAL_KEYS,
  ...RTO_INTERNAL_KEYS,
  "reship",
  "cancelled",
  "canceled",
] as const;

export const FULFILLMENT_PIPELINE_MATCH_VALUES = variantsForKeys(FULFILLMENT_PIPELINE_INTERNAL);

/** Raw normalized keys → internal lifecycle key (before tab classification). */
const RAW_KEY_TO_INTERNAL: Record<string, string> = {
  // Ready to ship
  ready_to_ship: "ready_to_ship",
  awaiting_shipment: "ready_to_ship",
  booked: "ready_to_ship",
  manifested: "ready_to_ship",
  pickup_pending: "ready_to_ship",
  draft: "draft",
  pending: "draft",
  rts: "ready_to_ship",
  // Pending pickup
  pending_pickup: "pending_pickup",
  pickup_scheduled: "pending_pickup",
  ready_for_pickup: "pending_pickup",
  out_for_pickup: "pending_pickup",
  pickup_out_for_pickup: "pending_pickup",
  not_picked: "pending_pickup",
  on_process: "pending_pickup",
  // In transit
  in_transit: "in_transit",
  intransit: "in_transit",
  shipped: "in_transit",
  shipment_in_transit: "in_transit",
  picked_up: "in_transit",
  pickedup: "in_transit",
  pickup: "in_transit",
  dispatched: "in_transit",
  dispatch: "in_transit",
  connected: "in_transit",
  bagged: "in_transit",
  bagging: "in_transit",
  departed: "in_transit",
  left_origin: "in_transit",
  reached_destination_hub: "in_transit",
  reached_hub: "in_transit",
  at_hub: "in_transit",
  in_hub: "in_transit",
  hub_scan: "in_transit",
  scanned: "in_transit",
  received: "in_transit",
  arrival: "in_transit",
  arrived: "in_transit",
  shipment_booked: "pending_pickup",
  // Out for delivery
  out_for_delivery: "out_for_delivery",
  outfordelivery: "out_for_delivery",
  ofd: "out_for_delivery",
  // Delivered
  delivered: "delivered",
  // Processing failures
  failed: "processing_failed",
  processing_failed: "processing_failed",
  pickup_failed: "pickup_failed",
  pickupfailed: "pickup_failed",
  pick_up_failed: "pickup_failed",
  pickup_exception: "pickup_failed",
  pickupexception: "pickup_failed",
  booking_failed: "booking_failed",
  label_generation_failed: "label_generation_failed",
  courier_api_failed: "courier_api_failed",
  manifest_failed: "manifest_failed",
  booking_rejected: "booking_rejected",
  shipment_creation_failed: "shipment_creation_failed",
  shipment_lost: "shipment_lost",
  pickup_cancelled: "pickup_cancelled",
  pickup_canceled: "pickup_cancelled",
  lost: "shipment_lost",
  // NDR
  ndr: "ndr",
  ndr_raised: "ndr",
  customer_not_available: "ndr",
  customer_refused: "ndr",
  address_incomplete: "ndr",
  address_issue: "ndr",
  door_locked: "ndr",
  phone_unreachable: "ndr",
  delivery_attempt_failed: "ndr",
  consignee_shifted: "ndr",
  reattempt_required: "ndr",
  delivery_exception: "ndr",
  need_attention: "ndr",
  needs_attention: "ndr",
  reattempt_delivery: "ndr",
  undelivered: "ndr",
  undelivered_attempted: "ndr",
  undelivered_unattempted: "ndr",
  delivery_failed: "ndr",
  failed_delivery: "ndr",
  not_picked_up: "ndr",
  rejected: "ndr",
  // RTO
  rto: "rto",
  rto_initiated: "rto",
  rto_in_transit: "rto",
  rto_dispatched: "rto",
  rto_out_for_delivery: "rto",
  rto_delivered: "rto",
  returned: "rto",
  return_received: "rto",
  shipment_returned: "rto",
  return_complete: "rto",
  return_in_transit: "rto",
  return_delivered: "rto",
  return_pickup_scheduled: "rto",
  return_not_picked: "rto",
  return_ndr_raised: "ndr",
  rto_created: "rto",
  rto_completed: "rto",
  return_expected: "rto",
  return_out_for_delivery: "rto",
  // Terminal / other
  cancelled: "cancelled",
  canceled: "cancelled",
  cancellation: "cancelled",
  reship: "reship",
  junk: "cancelled",
};

const PROVIDER_RAW_OVERRIDES: Record<string, Record<string, string>> = {
  velocity: {
    pickupfailed: "pickup_failed",
    pickup_failed: "pickup_failed",
    pickup_cancelled: "pickup_cancelled",
    shipment_lost: "shipment_lost",
  },
  lorrigo: {
    pickup_failed: "pickup_failed",
    pickupfailed: "pickup_failed",
    pickup_cancelled: "pickup_cancelled",
    shipment_lost: "shipment_lost",
    booking_failed: "booking_failed",
    out_for_pickup: "pending_pickup",
    pickup_out_for_pickup: "pending_pickup",
    pickup_exception: "pickup_failed",
    pickupexception: "pickup_failed",
  },
  ekart: {
    pickup_cancelled: "pickup_cancelled",
    not_picked: "pickup_failed",
    pickup_reattempt: "pickup_failed",
  },
};

function inferInternalFromHeuristics(key: string): string | undefined {
  if (!key) return undefined;
  if (key.includes("pickup") && (key.includes("fail") || key.includes("cancel") || key.includes("exception"))) {
    return key.includes("cancel") ? "pickup_cancelled" : "pickup_failed";
  }
  if (key.includes("booking") && key.includes("fail")) return "booking_failed";
  if (key.includes("label") && key.includes("fail")) return "label_generation_failed";
  if (key.includes("manifest") && key.includes("fail")) return "manifest_failed";
  if (key.includes("shipment") && key.includes("creation") && key.includes("fail")) {
    return "shipment_creation_failed";
  }
  if (key.includes("lost")) return "shipment_lost";
  if (key.includes("cancel") || key.includes("reject")) return "cancelled";
  if (key.includes("rto") || (key.includes("return") && !key.includes("pickup"))) return "rto";
  if (
    key.includes("ndr") ||
    key.includes("undeliver") ||
    key.includes("delivery_attempt") ||
    key.includes("delivery_exception") ||
    key.includes("reattempt") ||
    key.includes("consignee") ||
    key.includes("door_locked") ||
    key.includes("phone_unreachable") ||
    key.includes("address_issue") ||
    key.includes("address_incomplete") ||
    key.includes("customer_refused") ||
    key.includes("customer_not_available")
  ) {
    return "ndr";
  }
  if (key.includes("deliver") && !key.includes("out")) return "delivered";
  if (key.includes("out_for_pickup") || key === "pickup_out_for_pickup") {
    return "pending_pickup";
  }
  if (key.includes("out_for_deliver") || key === "ofd" || key.includes("outfordelivery")) {
    return "out_for_delivery";
  }
  if (
    key.includes("transit") ||
    key.includes("dispatch") ||
    key.includes("ship") ||
    key.includes("bag") ||
    key.includes("connect") ||
    key.includes("hub") ||
    key.includes("scan") ||
    key.includes("reach") ||
    key.includes("arriv") ||
    key.includes("depart") ||
    key.includes("left_") ||
    key.includes("in_facility") ||
    key.includes("received_at")
  ) {
    return "in_transit";
  }
  if (key.includes("pick") && !key.includes("not") && !key.includes("schedul")) {
    return "in_transit";
  }
  if (key.includes("pickup") && key.includes("schedul")) return "pending_pickup";
  if (key.includes("ready") && key.includes("ship")) return "ready_to_ship";
  if (key.includes("manifest")) return "ready_to_ship";
  if (key.includes("booked")) return "ready_to_ship";
  return undefined;
}

/**
 * Normalize provider raw tracking status to internal snake_case key.
 */
export function normalizeTrackingStatus(
  raw: unknown,
  provider?: CourierProviderId | string
): string {
  const key = normalizeTrackingKey(raw);
  if (!key) return "draft";

  const prov = String(provider ?? "").trim().toLowerCase();
  if (prov && PROVIDER_RAW_OVERRIDES[prov]?.[key]) {
    return PROVIDER_RAW_OVERRIDES[prov][key]!;
  }
  if (RAW_KEY_TO_INTERNAL[key]) return RAW_KEY_TO_INTERNAL[key]!;
  const inferred = inferInternalFromHeuristics(key);
  if (inferred) return inferred;
  return key;
}

const INTERNAL_PROGRESS_RANK: Record<string, number> = {
  draft: 5,
  pending: 5,
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
  processing_failed: 50,
  pickup_failed: 50,
  booking_failed: 50,
  label_generation_failed: 50,
  courier_api_failed: 50,
  manifest_failed: 50,
  booking_rejected: 50,
  shipment_creation_failed: 50,
  shipment_lost: 50,
  pickup_cancelled: 50,
  ndr: 55,
  rto: 60,
  cancelled: 60,
  delivered: 70,
  reship: 5,
};

export function internalStatusProgressRank(internalKey: string): number {
  return INTERNAL_PROGRESS_RANK[internalKey] ?? 20;
}

/** Pick the later internal status from status vs shipmentStatus. */
export function effectiveInternalStatus(
  status?: unknown,
  shipmentStatus?: unknown,
  provider?: CourierProviderId | string
): string {
  const st = normalizeTrackingStatus(status, provider);
  const ship = normalizeTrackingStatus(shipmentStatus, provider);
  const rSt = internalStatusProgressRank(st);
  const rShip = internalStatusProgressRank(ship);
  if (rShip > rSt) return ship;
  if (rSt > rShip) return st;
  return ship || st;
}

function internalKeyToTabCategory(internalKey: string): OrderTabCategory | undefined {
  if (READY_TO_SHIP_INTERNAL_KEYS.includes(internalKey as typeof READY_TO_SHIP_INTERNAL_KEYS[number])) {
    return "ready_to_ship";
  }
  if (PENDING_PICKUP_INTERNAL_KEYS.includes(internalKey as typeof PENDING_PICKUP_INTERNAL_KEYS[number])) {
    return "pending_pickup";
  }
  if (IN_TRANSIT_INTERNAL_KEYS.includes(internalKey as typeof IN_TRANSIT_INTERNAL_KEYS[number])) {
    return "in_transit";
  }
  if (OUT_FOR_DELIVERY_INTERNAL_KEYS.includes(internalKey as typeof OUT_FOR_DELIVERY_INTERNAL_KEYS[number])) {
    return "out_for_delivery";
  }
  if (DELIVERED_INTERNAL_KEYS.includes(internalKey as typeof DELIVERED_INTERNAL_KEYS[number])) {
    return "delivered";
  }
  if (
    PROCESSING_FAILED_INTERNAL_KEYS.includes(internalKey as typeof PROCESSING_FAILED_INTERNAL_KEYS[number])
  ) {
    return "failed";
  }
  if (NDR_INTERNAL_KEYS.includes(internalKey as typeof NDR_INTERNAL_KEYS[number])) {
    return "ndr";
  }
  if (RTO_INTERNAL_KEYS.includes(internalKey as typeof RTO_INTERNAL_KEYS[number])) {
    return "rto";
  }
  if (internalKey === "reship") return "reship";
  if (internalKey === "cancelled") return "failed";
  return undefined;
}

export interface OrderClassificationInput {
  status?: unknown;
  shipmentStatus?: unknown;
  awb?: unknown;
  isJunk?: boolean;
  shipmentCreated?: boolean;
  externalSource?: unknown;
  channel?: unknown;
  courierProvider?: CourierProviderId | string;
}

/** Classify an order into a dashboard tab category. */
export function classifyOrderTab(order: OrderClassificationInput): OrderTabCategory | undefined {
  if (order.isJunk) return "junk";

  const statusKey = normalizeTrackingStatus(order.status, order.courierProvider);
  if (statusKey === "reship") return "reship";

  const shipmentKey = normalizeTrackingStatus(order.shipmentStatus, order.courierProvider);
  const shipmentCategory = internalKeyToTabCategory(shipmentKey);
  if (
    shipmentCategory === "pending_pickup" ||
    shipmentCategory === "failed" ||
    shipmentCategory === "ndr" ||
    shipmentCategory === "rto"
  ) {
    return shipmentCategory;
  }

  const effective = effectiveInternalStatus(
    order.status,
    order.shipmentStatus,
    order.courierProvider
  );
  const hasAwb = Boolean(String(order.awb ?? "").trim());
  const category = internalKeyToTabCategory(effective);

  if (category === "ready_to_ship" && hasAwb) return "pending_pickup";
  if (category === "ready_to_ship" && !hasAwb) return "ready_to_ship";
  return category;
}

/** Tab slug used in API (kebab-case). */
export function normalizeTabSlug(tab: string): string {
  return String(tab ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

export function isChannelSource(order: Pick<OrderClassificationInput, "externalSource" | "channel">): boolean {
  const channel = String(order.channel ?? "");
  const externalSource = String(order.externalSource ?? "").toLowerCase();
  if (channel === "Shopify" || externalSource === "shopify") return true;
  if (externalSource && externalSource !== "manual") return true;
  return Boolean(channel && channel !== "Manual");
}

/** Client-side tab match — mirrors buildTabQuery. */
export function orderMatchesTabCategory(order: OrderClassificationInput, tab: string): boolean {
  const slug = normalizeTabSlug(tab);
  if (slug === "all") return true;

  const classified = classifyOrderTab(order);
  if (slug === "junk") return classified === "junk";

  const statusKey = normalizeTrackingStatus(order.status, order.courierProvider);
  const hasAwb = Boolean(String(order.awb ?? "").trim());
  const shipmentCreated = Boolean(order.shipmentCreated);
  const effective = effectiveInternalStatus(
    order.status,
    order.shipmentStatus,
    order.courierProvider
  );
  const isPreFulfillment =
    !FULFILLMENT_PIPELINE_INTERNAL.includes(
      effective as typeof FULFILLMENT_PIPELINE_INTERNAL[number]
    ) &&
    !hasAwb &&
    !shipmentCreated;

  if (slug === "channel") {
    return isChannelSource(order) && classified !== "junk" && classified !== "reship" && isPreFulfillment;
  }
  if (slug === "manual") {
    return !isChannelSource(order) && classified !== "junk" && classified !== "reship" && isPreFulfillment;
  }
  if (slug === "ready-to-ship") {
    return classified === "ready_to_ship";
  }
  if (slug === "pending-pickup") {
    if (classified === "pending_pickup") return true;
    return hasAwb && internalKeyToTabCategory(effective) === "ready_to_ship";
  }
  if (slug === "reship") return statusKey === "reship" && !order.isJunk;

  const tabCategory = slug.replace(/-/g, "_") as OrderTabCategory;
  if (classified === tabCategory) return true;
  return false;
}

/** Status values that must not appear in Ready to Ship (higher pipeline stages). */
export const AFTER_READY_TO_SHIP_MATCH_VALUES = variantsForKeys([
  ...PENDING_PICKUP_INTERNAL_KEYS,
  ...IN_TRANSIT_INTERNAL_KEYS,
  ...OUT_FOR_DELIVERY_INTERNAL_KEYS,
  ...DELIVERED_INTERNAL_KEYS,
  ...PROCESSING_FAILED_INTERNAL_KEYS,
  ...NDR_INTERNAL_KEYS,
  ...RTO_INTERNAL_KEYS,
  "cancelled",
  "canceled",
]);

export const AFTER_PENDING_PICKUP_MATCH_VALUES = variantsForKeys([
  ...IN_TRANSIT_INTERNAL_KEYS,
  ...OUT_FOR_DELIVERY_INTERNAL_KEYS,
  ...DELIVERED_INTERNAL_KEYS,
  ...PROCESSING_FAILED_INTERNAL_KEYS,
  ...NDR_INTERNAL_KEYS,
  ...RTO_INTERNAL_KEYS,
  "cancelled",
  "canceled",
]);

export const AFTER_IN_TRANSIT_MATCH_VALUES = variantsForKeys([
  ...OUT_FOR_DELIVERY_INTERNAL_KEYS,
  ...DELIVERED_INTERNAL_KEYS,
  ...PROCESSING_FAILED_INTERNAL_KEYS,
  ...NDR_INTERNAL_KEYS,
  ...RTO_INTERNAL_KEYS,
  "cancelled",
  "canceled",
]);

export const AFTER_OUT_FOR_DELIVERY_MATCH_VALUES = variantsForKeys([
  ...DELIVERED_INTERNAL_KEYS,
  ...PROCESSING_FAILED_INTERNAL_KEYS,
  ...NDR_INTERNAL_KEYS,
  ...RTO_INTERNAL_KEYS,
  "cancelled",
  "canceled",
]);

export const AFTER_FAILED_MATCH_VALUES = variantsForKeys([
  ...DELIVERED_INTERNAL_KEYS,
  ...RTO_INTERNAL_KEYS,
  ...NDR_INTERNAL_KEYS,
  "cancelled",
  "canceled",
]);

export const AFTER_NDR_MATCH_VALUES = variantsForKeys([
  ...DELIVERED_INTERNAL_KEYS,
  ...RTO_INTERNAL_KEYS,
  "cancelled",
  "canceled",
]);

export const AFTER_RTO_MATCH_VALUES = variantsForKeys([
  ...DELIVERED_INTERNAL_KEYS,
  "cancelled",
  "canceled",
]);
