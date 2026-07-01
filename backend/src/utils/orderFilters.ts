import mongoose from "mongoose";
import type { IUser } from "../models/User.js";
import { Vendor } from "../models/Vendor.js";
import { vendorOwnedPickupIds } from "./pickupVendor.js";

/** Role-scoped base filter (before junk/view/tab). */
export async function buildOrderVisibilityQuery(user: IUser): Promise<Record<string, unknown>> {
  if (user.role === "admin") return {};
  if (user.role === "vendor") {
    const v = await Vendor.findOne({ userId: user._id });
    if (v) {
      const pickupIds = await vendorOwnedPickupIds(user._id);
      const or: Record<string, unknown>[] = [{ vendorId: v._id }];
      if (pickupIds.length > 0) {
        or.push({ pickupAddressId: { $in: pickupIds } });
      }
      return { $or: or };
    }
    return { createdBy: user._id };
  }
  return {
    $or: [{ ownerUserId: user._id }, { createdBy: user._id }, { dropshipperId: user._id }],
  };
}

const READY_OR_PENDING_PICKUP = [
  "ready-to-ship",
  "ready_to_ship",
  "Ready to Ship",
  "pending-pickup",
  "pending_pickup",
  "Pending Pickup",
  "pickup_scheduled",
  "pickup-scheduled",
  "Pickup Scheduled",
];

/** Orders past Manual / Channel staging — hidden until moved to Ready to Ship. */
const FULFILLMENT_PIPELINE_STATUSES = [
  ...READY_OR_PENDING_PICKUP,
  "picked_up",
  "picked-up",
  "Picked Up",
  "in-transit",
  "in_transit",
  "In Transit",
  "In transit",
  "In-Transit",
  "In-transit",
  "shipped",
  "Shipped",
  "out-for-delivery",
  "out_for_delivery",
  "Out For Delivery",
  "Out for Delivery",
  "Out-For-Delivery",
  "Out-for-delivery",
  "delivered",
  "Delivered",
  "failed",
  "Failed",
  "ndr",
  "NDR",
  "not_picked",
  "not-picked",
  "Not Picked",
  "rto",
  "RTO",
  "reship",
  "cancelled",
  "canceled",
  "Cancelled",
  "Canceled",
];

const READY_TO_SHIP_STATUSES = ["ready-to-ship", "ready_to_ship", "Ready to Ship"];
const PENDING_PICKUP_STATUSES = [
  "pending-pickup",
  "pending_pickup",
  "Pending Pickup",
  "pickup_scheduled",
  "pickup-scheduled",
  "Pickup Scheduled",
];
const IN_TRANSIT_STATUSES = [
  "in-transit",
  "in_transit",
  "In Transit",
  "In transit",
  "In-Transit",
  "In-transit",
  "shipped",
  "Shipped",
  "picked_up",
  "picked-up",
  "Picked Up",
];
const FAILED_STATUSES = [
  "failed",
  "Failed",
  "ndr",
  "NDR",
  "ndr_raised",
  "NDR raised",
  "need_attention",
  "needs_attention",
  "reattempt_delivery",
  "not_picked",
  "not-picked",
  "Not Picked",
];
const OUT_FOR_DELIVERY_STATUSES = [
  "out-for-delivery",
  "out_for_delivery",
  "Out For Delivery",
  "Out for Delivery",
  "Out-For-Delivery",
  "Out-for-delivery",
];
const DELIVERED_STATUSES = ["delivered", "Delivered"];
const CLOSED_STATUSES = [...DELIVERED_STATUSES, "rto", "RTO", "cancelled", "canceled", "Cancelled", "Canceled"];
const AFTER_READY_TO_SHIP_STATUSES = [
  ...PENDING_PICKUP_STATUSES,
  ...IN_TRANSIT_STATUSES,
  ...OUT_FOR_DELIVERY_STATUSES,
  ...DELIVERED_STATUSES,
  ...FAILED_STATUSES,
  ...CLOSED_STATUSES,
];
const AFTER_PENDING_PICKUP_STATUSES = [
  ...IN_TRANSIT_STATUSES,
  ...OUT_FOR_DELIVERY_STATUSES,
  ...DELIVERED_STATUSES,
  ...FAILED_STATUSES,
  ...CLOSED_STATUSES,
];
const AFTER_IN_TRANSIT_STATUSES = [
  ...OUT_FOR_DELIVERY_STATUSES,
  ...DELIVERED_STATUSES,
  ...FAILED_STATUSES,
  ...CLOSED_STATUSES,
];
const AFTER_OUT_FOR_DELIVERY_STATUSES = [...DELIVERED_STATUSES, ...FAILED_STATUSES, ...CLOSED_STATUSES];
const AFTER_FAILED_STATUSES = [...DELIVERED_STATUSES, ...CLOSED_STATUSES];

/** Shopify today; any non-empty externalSource (except manual) counts as channel for future platforms. */
function channelSourceFilter(): Record<string, unknown> {
  return {
    $or: [
      { externalSource: "shopify" },
      { channel: "Shopify" },
      {
        $and: [
          { externalSource: { $exists: true, $nin: [null, ""] } },
          { externalSource: { $ne: "manual" } },
        ],
      },
    ],
  };
}

function manualSourceFilter(): Record<string, unknown> {
  return {
    $nor: [
      { externalSource: "shopify" },
      { channel: "Shopify" },
      {
        $and: [
          { externalSource: { $exists: true, $nin: [null, ""] } },
          { externalSource: { $ne: "manual" } },
        ],
      },
    ],
  };
}

/** Channel / Manual tabs: unprocessed orders only (not yet moved to Ready to Ship). */
function channelManualBaseQuery(channelOrManual: "channel" | "manual"): Record<string, unknown> {
  const sourceFilter = channelOrManual === "channel" ? channelSourceFilter() : manualSourceFilter();
  return {
    $and: [
      { isJunk: { $ne: true } },
      { status: { $ne: "reship", $nin: FULFILLMENT_PIPELINE_STATUSES } },
      { shipmentStatus: { $nin: FULFILLMENT_PIPELINE_STATUSES } },
      { shipmentCreated: { $ne: true } },
      { $or: [{ awb: { $exists: false } }, { awb: null }, { awb: "" }] },
      sourceFilter,
    ],
  };
}

function statusOrShipmentStatusIn(statuses: string[]): Record<string, unknown> {
  return {
    $or: [
      { status: { $in: statuses } },
      { shipmentStatus: { $in: statuses } },
    ],
  };
}

function neitherStatusNorShipmentStatusIn(statuses: string[]): Record<string, unknown> {
  return {
    $and: [
      { status: { $nin: statuses } },
      { shipmentStatus: { $nin: statuses } },
    ],
  };
}

/**
 * Tab filters aligned with Orders dashboard business rules:
 * - ALL: every order including Junk and Reship (master list)
 * - CHANNEL / MANUAL: unprocessed orders only (pending/draft — not yet moved to Ready to Ship)
 * - READY TO SHIP → PENDING PICKUP → IN TRANSIT → OUT FOR DELIVERY → DELIVERED
 * - RESHIP: cancelled from Pending Pickup+ (AWB cleared); re-book from here
 * - FAILED: serviceability, address, pincode, NDR, etc.
 * - JUNK: cancelled from ALL / Channel / Manual / Ready to Ship (separate junk view)
 */
export function buildTabQuery(tab: string): Record<string, unknown> | undefined {
  const t = tab.toLowerCase();
  if (t === "junk") return undefined;

  if (t === "all") {
    return undefined;
  }
  if (t === "channel") {
    return channelManualBaseQuery("channel");
  }
  if (t === "manual") {
    return channelManualBaseQuery("manual");
  }
  if (t === "ready-to-ship" || t === "ready_to_ship") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(READY_TO_SHIP_STATUSES),
        neitherStatusNorShipmentStatusIn(AFTER_READY_TO_SHIP_STATUSES),
        { $or: [{ awb: { $exists: false } }, { awb: null }, { awb: "" }] },
      ],
    };
  }
  if (t === "pending-pickup" || t === "pending_pickup") {
    return {
      isJunk: { $ne: true },
      $and: [
        {
          $or: [
            statusOrShipmentStatusIn(PENDING_PICKUP_STATUSES),
            {
              ...statusOrShipmentStatusIn(READY_TO_SHIP_STATUSES),
              awb: { $regex: /\S/ },
            },
          ],
        },
        neitherStatusNorShipmentStatusIn(AFTER_PENDING_PICKUP_STATUSES),
      ],
    };
  }
  if (t === "in-transit" || t === "in_transit") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(IN_TRANSIT_STATUSES),
        neitherStatusNorShipmentStatusIn(AFTER_IN_TRANSIT_STATUSES),
      ],
    };
  }
  if (t === "out-for-delivery" || t === "out_for_delivery") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(OUT_FOR_DELIVERY_STATUSES),
        neitherStatusNorShipmentStatusIn(AFTER_OUT_FOR_DELIVERY_STATUSES),
      ],
    };
  }
  if (t === "delivered") {
    return { isJunk: { $ne: true }, ...statusOrShipmentStatusIn(DELIVERED_STATUSES) };
  }
  if (t === "reship") {
    return { isJunk: { $ne: true }, status: "reship" };
  }
  if (t === "failed") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(FAILED_STATUSES),
        neitherStatusNorShipmentStatusIn(AFTER_FAILED_STATUSES),
      ],
    };
  }
  return undefined;
}

export function mergeQueries(a: Record<string, unknown>, b?: Record<string, unknown>): Record<string, unknown> {
  if (!b || Object.keys(b).length === 0) return { ...a };
  return { $and: [a, b] };
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function parseYesNo(v: unknown): "yes" | "no" | undefined {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "yes" || s === "1" || s === "true") return "yes";
  if (s === "no" || s === "0" || s === "false") return "no";
  return undefined;
}

function parseNum(v: unknown): number | undefined {
  const n = parseFloat(String(v ?? "").trim());
  if (!Number.isFinite(n)) return undefined;
  if (n < 0 || n > 1e12) return undefined;
  return n;
}

export type ParsedOrderListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  payment?: string;
  courier?: string;
  source?: string;
  fulfillment?: string;
  dateFrom?: Date;
  dateTo?: Date;
  tab?: string;
  counts: boolean;
  customerCity?: string;
  customerState?: string;
  pickupCity?: string;
  pickupState?: string;
  productSku?: string;
  productName?: string;
  amountMin?: number;
  amountMax?: number;
  hasAwb?: "yes" | "no";
  shipmentCreated?: "yes" | "no";
  dropshipperId?: string;
  vendorId?: string;
};

export function parseOrderListQuery(q: Record<string, unknown>): ParsedOrderListQuery {
  const page = Math.max(1, parseInt(String(q.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(q.pageSize ?? "50"), 10) || 50));
  const search = clip(String(q.q ?? q.search ?? ""), 200) || undefined;
  const status = clip(String(q.status ?? ""), 80) || undefined;
  let payment = clip(String(q.payment ?? ""), 40) || undefined;
  if (payment) {
    const pl = payment.toLowerCase();
    if (pl === "cod") payment = "COD";
    else if (pl === "prepaid" || pl === "pre-paid") payment = "Prepaid";
  }
  const courier = clip(String(q.courier ?? ""), 120) || undefined;
  const source = clip(String(q.source ?? ""), 20).toLowerCase() || undefined;
  const fulfillment = clip(String(q.fulfillment ?? ""), 40).toLowerCase() || undefined;
  const tab = clip(String(q.tab ?? ""), 40) || undefined;
  const counts = String(q.counts ?? "").toLowerCase() === "1" || String(q.counts ?? "") === "true";

  const customerCity = clip(String(q.customerCity ?? ""), 120) || undefined;
  const customerState = clip(String(q.customerState ?? ""), 120) || undefined;
  const pickupCity = clip(String(q.pickupCity ?? ""), 120) || undefined;
  const pickupState = clip(String(q.pickupState ?? ""), 120) || undefined;
  const productSku = clip(String(q.productSku ?? ""), 120) || undefined;
  const productName = clip(String(q.productName ?? ""), 200) || undefined;

  let amountMin = parseNum(q.amountMin);
  let amountMax = parseNum(q.amountMax);
  if (amountMin != null && amountMax != null && amountMin > amountMax) {
    const t = amountMin;
    amountMin = amountMax;
    amountMax = t;
  }

  const hasAwb = parseYesNo(q.hasAwb);
  const shipmentCreated = parseYesNo(q.shipmentCreated);
  const dropshipperId = clip(String(q.dropshipperId ?? ""), 40) || undefined;
  const vendorId = clip(String(q.vendorId ?? ""), 40) || undefined;

  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  const rawFrom = q.dateFrom ?? q.fromDate;
  const rawTo = q.dateTo ?? q.toDate;
  if (rawFrom) {
    const d = new Date(String(rawFrom));
    if (!Number.isNaN(d.getTime())) dateFrom = d;
  }
  if (rawTo) {
    const d = new Date(String(rawTo));
    if (!Number.isNaN(d.getTime())) dateTo = d;
  }

  return {
    page,
    pageSize,
    search,
    status,
    payment,
    courier,
    source,
    fulfillment,
    dateFrom,
    dateTo,
    tab,
    counts,
    customerCity,
    customerState,
    pickupCity,
    pickupState,
    productSku,
    productName,
    amountMin,
    amountMax,
    hasAwb,
    shipmentCreated,
    dropshipperId,
    vendorId,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive partial match across order id, tracking, customer, line items, etc. */
export function buildSearchQuery(search: string): Record<string, unknown> {
  const trimmed = search.trim();
  const esc = escapeRegex(trimmed);
  const rx = new RegExp(esc, "i");
  const or: Record<string, unknown>[] = [
    { orderId: rx },
    { customer: rx },
    { phone: rx },
    { customerPhone: rx },
    { awb: rx },
    { trackingId: rx },
    { trackingUrl: rx },
    { shipmentId: rx },
    { velocityShipmentId: rx },
    { velocityOrderId: rx },
    { externalOrderName: rx },
    { shopifyOrderNumericId: rx },
    { channel: rx },
    { "products.name": rx },
    { "products.title": rx },
    { "products.sku": rx },
    { "orderItems.name": rx },
    { "orderItems.title": rx },
    { "orderItems.sku": rx },
    { "items.name": rx },
    { "items.title": rx },
    { "items.sku": rx },
    { "shopifyLineItems.name": rx },
    { "shopifyLineItems.title": rx },
    { "shopifyLineItems.sku": rx },
  ];
  if (mongoose.Types.ObjectId.isValid(trimmed) && String(trimmed).length === 24) {
    try {
      or.push({ _id: new mongoose.Types.ObjectId(trimmed) });
    } catch {
      /* ignore invalid cast */
    }
  }
  return { $or: or };
}

/**
 * All list filters except visibility, junk/view, and tab — used for main list and tabCounts.
 */
export function buildOrderListFiltersQuery(pq: ParsedOrderListQuery): Record<string, unknown> | undefined {
  const parts: Record<string, unknown>[] = [];

  if (pq.search) parts.push(buildSearchQuery(pq.search));
  if (pq.status) parts.push({ status: pq.status });
  if (pq.payment) parts.push({ payment: pq.payment });
  if (pq.courier) {
    const rx = new RegExp(escapeRegex(pq.courier), "i");
    parts.push({ $or: [{ courier: rx }, { courierName: rx }] });
  }
  if (pq.source === "shopify" || pq.source === "channel") {
    parts.push(channelSourceFilter());
  } else if (pq.source === "manual") {
    parts.push(manualSourceFilter());
  }
  if (pq.fulfillment) {
    const esc = escapeRegex(pq.fulfillment);
    parts.push({ shopifyFulfillmentStatus: new RegExp(`^${esc}$`, "i") });
  }
  if (pq.dateFrom || pq.dateTo) {
    const range: Record<string, unknown> = {};
    if (pq.dateFrom) range.$gte = pq.dateFrom;
    if (pq.dateTo) {
      const end = new Date(pq.dateTo);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    parts.push({ createdAt: range });
  }
  if (pq.customerCity) {
    const rx = new RegExp(escapeRegex(pq.customerCity), "i");
    parts.push({ $or: [{ city: rx }, { shippingCity: rx }] });
  }
  if (pq.customerState) {
    const rx = new RegExp(escapeRegex(pq.customerState), "i");
    parts.push({ $or: [{ state: rx }, { shippingState: rx }] });
  }
  if (pq.pickupCity) {
    const rx = new RegExp(escapeRegex(pq.pickupCity), "i");
    parts.push({ "pickupAddress.city": rx });
  }
  if (pq.pickupState) {
    const rx = new RegExp(escapeRegex(pq.pickupState), "i");
    parts.push({ "pickupAddress.state": rx });
  }
  if (pq.productName) {
    const rx = new RegExp(escapeRegex(pq.productName), "i");
    parts.push({
      $or: [
        { "products.name": rx },
        { "products.title": rx },
        { "orderItems.name": rx },
        { "orderItems.title": rx },
        { "items.name": rx },
        { "items.title": rx },
        { "shopifyLineItems.name": rx },
        { "shopifyLineItems.title": rx },
      ],
    });
  }
  if (pq.productSku) {
    const rx = new RegExp(escapeRegex(pq.productSku), "i");
    parts.push({
      $or: [
        { "products.sku": rx },
        { "orderItems.sku": rx },
        { "items.sku": rx },
        { "shopifyLineItems.sku": rx },
      ],
    });
  }
  if (pq.amountMin != null || pq.amountMax != null) {
    const range: Record<string, number> = {};
    if (pq.amountMin != null) range.$gte = pq.amountMin;
    if (pq.amountMax != null) range.$lte = pq.amountMax;
    parts.push({ amount: range });
  }
  if (pq.hasAwb === "yes") {
    parts.push({ awb: { $regex: /\S/ } });
  } else if (pq.hasAwb === "no") {
    parts.push({ $or: [{ awb: { $exists: false } }, { awb: null }, { awb: "" }] });
  }
  if (pq.shipmentCreated === "yes") {
    parts.push({ shipmentCreated: true });
  } else if (pq.shipmentCreated === "no") {
    parts.push({ $or: [{ shipmentCreated: false }, { shipmentCreated: { $exists: false } }] });
  }
  if (pq.dropshipperId && mongoose.Types.ObjectId.isValid(pq.dropshipperId)) {
    const id = new mongoose.Types.ObjectId(pq.dropshipperId);
    parts.push({ $or: [{ ownerUserId: id }, { createdBy: id }, { dropshipperId: id }] });
  }
  if (pq.vendorId && mongoose.Types.ObjectId.isValid(pq.vendorId)) {
    parts.push({ vendorId: new mongoose.Types.ObjectId(pq.vendorId) });
  }

  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0]! : { $and: parts };
}
