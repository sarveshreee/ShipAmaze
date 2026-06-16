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
  "pending-pickup",
  "pending_pickup",
  "pickup_scheduled",
];

/** Tab filters aligned with frontend OrdersPageWithTabs.filterByTab */
export function buildTabQuery(tab: string): Record<string, unknown> | undefined {
  const t = tab.toLowerCase();
  if (t === "junk") return undefined;

  // All / Channel / Manual include Ready-to-Ship (and other non-junk, non-reship) so admins can
  // "Process Selected" from these tabs without switching away from channel/manual slices.
  if (t === "all") {
    return {
      isJunk: { $ne: true },
      status: { $ne: "reship" },
    };
  }
  if (t === "channel") {
    return {
      isJunk: { $ne: true },
      status: { $ne: "reship" },
      $or: [{ externalSource: "shopify" }, { channel: "Shopify" }],
    };
  }
  if (t === "manual") {
    return {
      isJunk: { $ne: true },
      status: { $ne: "reship" },
      $nor: [{ externalSource: "shopify" }, { channel: "Shopify" }],
    };
  }
  if (t === "ready-to-ship" || t === "ready_to_ship") {
    return {
      isJunk: { $ne: true },
      status: { $in: ["ready-to-ship", "ready_to_ship"] },
      $or: [{ awb: { $exists: false } }, { awb: null }, { awb: "" }],
    };
  }
  if (t === "pending-pickup" || t === "pending_pickup") {
    return {
      isJunk: { $ne: true },
      $or: [
        { status: { $in: ["pending-pickup", "pending_pickup", "pickup_scheduled"] } },
        {
          status: { $in: ["ready-to-ship", "ready_to_ship"] },
          awb: { $regex: /\S/ },
        },
      ],
    };
  }
  if (t === "in-transit" || t === "in_transit") {
    return { isJunk: { $ne: true }, status: { $in: ["in-transit", "in_transit", "shipped"] } };
  }
  if (t === "out-for-delivery" || t === "out_for_delivery") {
    return { isJunk: { $ne: true }, status: { $in: ["out-for-delivery", "out_for_delivery"] } };
  }
  if (t === "delivered") {
    return { isJunk: { $ne: true }, status: "delivered" };
  }
  if (t === "reship") {
    return { status: "reship" };
  }
  if (t === "failed") {
    return { isJunk: { $ne: true }, status: "failed" };
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
    parts.push({ $or: [{ externalSource: "shopify" }, { channel: "Shopify" }] });
  } else if (pq.source === "manual") {
    parts.push({ $nor: [{ externalSource: "shopify" }, { channel: "Shopify" }] });
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

  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0]! : { $and: parts };
}
