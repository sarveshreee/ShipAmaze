import mongoose from "mongoose";
import type { IUser } from "../models/User.js";
import { Vendor } from "../models/Vendor.js";
import { pickupsLinkedToVendor } from "./pickupVendor.js";
import { parseYmdEnd, parseYmdStart } from "./dateOnly.js";
import { scanLookupClauses } from "./barcodeScanPriority.js";
import {
  AFTER_FAILED_MATCH_VALUES,
  AFTER_IN_TRANSIT_MATCH_VALUES,
  AFTER_NDR_MATCH_VALUES,
  AFTER_OUT_FOR_DELIVERY_MATCH_VALUES,
  AFTER_PENDING_PICKUP_MATCH_VALUES,
  AFTER_READY_TO_SHIP_MATCH_VALUES,
  AFTER_RTO_MATCH_VALUES,
  DELIVERED_MATCH_VALUES,
  FULFILLMENT_PIPELINE_MATCH_VALUES,
  IN_TRANSIT_MATCH_VALUES,
  NDR_MATCH_VALUES,
  OUT_FOR_DELIVERY_MATCH_VALUES,
  PENDING_PICKUP_MATCH_VALUES,
  PROCESSING_FAILED_MATCH_VALUES,
  READY_TO_SHIP_MATCH_VALUES,
  RTO_MATCH_VALUES,
  AFTER_DELIVERED_MATCH_VALUES,
} from "./orderStatusClassifier.js";

/** Role-scoped base filter (before junk/view/tab). */
export async function buildOrderVisibilityQuery(user: IUser): Promise<Record<string, unknown>> {
  if (user.role === "admin") return {};
  if (user.role === "vendor") {
    const v = await Vendor.findOne({ userId: user._id });
    if (v) {
      const linked = await pickupsLinkedToVendor(v._id as mongoose.Types.ObjectId, user._id);
      const or: Record<string, unknown>[] = [
        { vendorId: v._id },
        { createdBy: user._id },
        { ownerUserId: user._id },
      ];
      if (linked.ids.length > 0) {
        const idStrings = linked.ids.map((id) => String(id));
        or.push({ pickupAddressId: { $in: linked.ids } });
        or.push({ pickupWarehouseId: { $in: idStrings } });
      }
      // Match embedded pickup snapshots when vendorId was never set on the order.
      const names = [
        ...new Set(
          [String(v.name ?? "").trim(), ...linked.labels]
            .map((n) => n.trim())
            .filter(Boolean)
        ),
      ];
      for (const name of names) {
        const rx = new RegExp(`^${escapeRegex(name)}$`, "i");
        or.push({ "pickupAddress.label": rx });
        or.push({ "pickupAddress.warehouseName": rx });
        or.push({ "pickupAddress.pickupName": rx });
      }
      return { $or: or };
    }
    return { $or: [{ createdBy: user._id }, { ownerUserId: user._id }] };
  }
  // Dropshipper (and any other non-admin role): only their own orders.
  return {
    $or: [{ ownerUserId: user._id }, { createdBy: user._id }, { dropshipperId: user._id }],
  };
}

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
      { status: { $ne: "reship", $nin: FULFILLMENT_PIPELINE_MATCH_VALUES } },
      { shipmentStatus: { $nin: FULFILLMENT_PIPELINE_MATCH_VALUES } },
      { shipmentCreated: { $ne: true } },
      { $or: [{ awb: { $exists: false } }, { awb: null }, { awb: "" }] },
      sourceFilter,
    ],
  };
}

/** Case-insensitive exact match for courier strings like delivered / DELIVERED / Delivered. */
function statusMatchRegex(statuses: string[]): RegExp {
  const keys = [
    ...new Set(
      statuses
        .map((s) => String(s).trim().toLowerCase().replace(/[-\s]+/g, "_"))
        .filter(Boolean)
    ),
  ];
  const alts = keys.map((k) => escapeRegex(k).replace(/_/g, "[-_\\s]"));
  return new RegExp(`^(?:${alts.join("|")})$`, "i");
}

function statusOrShipmentStatusIn(statuses: string[]): Record<string, unknown> {
  const unique = [...new Set(statuses.map((s) => String(s).trim()).filter(Boolean))];
  const rx = statusMatchRegex(unique);
  return {
    $or: [
      { status: { $in: unique } },
      { shipmentStatus: { $in: unique } },
      { status: rx },
      { shipmentStatus: rx },
    ],
  };
}

function neitherStatusNorShipmentStatusIn(statuses: string[]): Record<string, unknown> {
  const unique = [...new Set(statuses.map((s) => String(s).trim()).filter(Boolean))];
  const rx = statusMatchRegex(unique);
  return {
    $and: [
      { status: { $nin: unique, $not: rx } },
      { shipmentStatus: { $nin: unique, $not: rx } },
    ],
  };
}

/**
 * Tab filters aligned with Orders dashboard business rules:
 * - ALL: every order including Junk and Reship (master list)
 * - CHANNEL / MANUAL: unprocessed orders only (pending/draft — not yet moved to Ready to Ship)
 * - READY TO SHIP → PENDING PICKUP → IN TRANSIT → OUT FOR DELIVERY → DELIVERED
 * - NDR / RTO / FAILED: classified via orderStatusClassifier
 * - RESHIP: cancelled from Pending Pickup+ (AWB cleared); re-book from here
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
        statusOrShipmentStatusIn(READY_TO_SHIP_MATCH_VALUES),
        neitherStatusNorShipmentStatusIn(AFTER_READY_TO_SHIP_MATCH_VALUES),
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
            statusOrShipmentStatusIn(PENDING_PICKUP_MATCH_VALUES),
            {
              ...statusOrShipmentStatusIn(READY_TO_SHIP_MATCH_VALUES),
              awb: { $regex: /\S/ },
            },
          ],
        },
        {
          $or: [
            { shipmentStatus: { $in: PENDING_PICKUP_MATCH_VALUES } },
            neitherStatusNorShipmentStatusIn(AFTER_PENDING_PICKUP_MATCH_VALUES),
          ],
        },
      ],
    };
  }
  if (t === "in-transit" || t === "in_transit") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(IN_TRANSIT_MATCH_VALUES),
        neitherStatusNorShipmentStatusIn(AFTER_IN_TRANSIT_MATCH_VALUES),
        neitherStatusNorShipmentStatusIn(PENDING_PICKUP_MATCH_VALUES),
        neitherStatusNorShipmentStatusIn(PROCESSING_FAILED_MATCH_VALUES),
      ],
    };
  }
  if (t === "out-for-delivery" || t === "out_for_delivery") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(OUT_FOR_DELIVERY_MATCH_VALUES),
        neitherStatusNorShipmentStatusIn(AFTER_OUT_FOR_DELIVERY_MATCH_VALUES),
      ],
    };
  }
  if (t === "delivered") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(DELIVERED_MATCH_VALUES),
        neitherStatusNorShipmentStatusIn(AFTER_DELIVERED_MATCH_VALUES),
      ],
    };
  }
  if (t === "reship") {
    return { isJunk: { $ne: true }, status: "reship" };
  }
  if (t === "failed") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(PROCESSING_FAILED_MATCH_VALUES),
        neitherStatusNorShipmentStatusIn(AFTER_FAILED_MATCH_VALUES),
      ],
    };
  }
  if (t === "ndr") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(NDR_MATCH_VALUES),
        neitherStatusNorShipmentStatusIn(AFTER_NDR_MATCH_VALUES),
      ],
    };
  }
  if (t === "rto") {
    return {
      isJunk: { $ne: true },
      $and: [
        statusOrShipmentStatusIn(RTO_MATCH_VALUES),
        neitherStatusNorShipmentStatusIn(AFTER_RTO_MATCH_VALUES),
      ],
    };
  }
  return undefined;
}

function normalizeStatusFilterKey(status: string): string {
  return status.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Status dropdown filter — mirrors tab matching (status OR shipmentStatus, aliases).
 * Used on the All tab and combined with other list filters for tab badge counts.
 */
export function buildStatusFilterQuery(status: string): Record<string, unknown> | undefined {
  const key = normalizeStatusFilterKey(status);
  if (!key) return undefined;

  if (key === "pending") {
    return {
      isJunk: { $ne: true },
      status: { $ne: "reship" },
      $and: [
        { status: { $nin: FULFILLMENT_PIPELINE_MATCH_VALUES } },
        { shipmentStatus: { $nin: FULFILLMENT_PIPELINE_MATCH_VALUES } },
        { shipmentCreated: { $ne: true } },
        { $or: [{ awb: { $exists: false } }, { awb: null }, { awb: "" }] },
      ],
    };
  }

  const tabQuery = buildTabQuery(key);
  if (tabQuery) return tabQuery;

  return {
    isJunk: { $ne: true },
    ...statusOrShipmentStatusIn([status.trim(), key, key.replace(/-/g, "_")]),
  };
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
  countsOnly: boolean;
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
  /** Which timestamp dateFrom/dateTo apply to: placed | pickup | delivered */
  dateType?: "placed" | "pickup" | "delivered";
};

export function parseOrderListQuery(q: Record<string, unknown>): ParsedOrderListQuery {
  const page = Math.max(1, parseInt(String(q.page ?? "1"), 10) || 1);
  const pageSize = Math.min(1000, Math.max(1, parseInt(String(q.pageSize ?? "50"), 10) || 50));
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
  const countsOnly =
    String(q.countsOnly ?? "").toLowerCase() === "1" || String(q.countsOnly ?? "") === "true";

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

  const dateFrom = parseYmdStart(q.dateFrom ?? q.fromDate);
  const dateTo = parseYmdEnd(q.dateTo ?? q.toDate);

  const dateTypeRaw = clip(String(q.dateType ?? ""), 20).toLowerCase();
  const dateType =
    dateTypeRaw === "pickup" || dateTypeRaw === "delivered" || dateTypeRaw === "placed"
      ? (dateTypeRaw as "placed" | "pickup" | "delivered")
      : undefined;

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
    dateType,
    tab,
    counts,
    countsOnly,
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

/** Case-insensitive partial match across order id, tracking, customer, line items, etc.
 * Scanner / barcode lookups prioritize AWB → tracking → order ID exact matches first.
 */
export function buildSearchQuery(search: string): Record<string, unknown> {
  const trimmed = search.trim();
  const esc = escapeRegex(trimmed);
  const rx = new RegExp(esc, "i");
  const or: Record<string, unknown>[] = [
    ...scanLookupClauses(trimmed),
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
 * Async so admin vendor filter can match pickup ownership / createdBy (not only vendorId).
 */
export async function buildOrderListFiltersQuery(
  pq: ParsedOrderListQuery
): Promise<Record<string, unknown> | undefined> {
  const parts: Record<string, unknown>[] = [];

  if (pq.search) parts.push(buildSearchQuery(pq.search));
  if (pq.status) {
    const statusQ = buildStatusFilterQuery(pq.status);
    if (statusQ) parts.push(statusQ);
  }
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
    if (pq.dateTo) range.$lte = pq.dateTo;
    const dateType = pq.dateType ?? "placed";
    if (dateType === "placed") {
      // First process / AWB generation time
      parts.push({
        $or: [
          { assignedDateTime: range },
          { movedToReadyAt: range },
          {
            statusHistory: {
              $elemMatch: {
                status: {
                  $regex:
                    /^(pending[_\s-]?pickup|shipment[_\s-]?booked|pickup[_\s-]?scheduled|ready[_\s-]?for[_\s-]?pickup)$/i,
                },
                at: range,
              },
            },
          },
        ],
      });
    } else if (dateType === "pickup") {
      // Actual courier pick-up time (not process/AWB time)
      parts.push({
        $or: [
          { pickupDate: range },
          {
            statusHistory: {
              $elemMatch: {
                status: {
                  $regex: /^(picked[_\s-]?up|in[_\s-]?transit)$/i,
                },
                at: range,
              },
            },
          },
        ],
      });
    } else if (dateType === "delivered") {
      parts.push({
        $or: [
          {
            statusHistory: {
              $elemMatch: {
                status: { $regex: /^delivered$/i },
                at: range,
              },
            },
          },
          // Fallback when history is missing but order is currently delivered
          {
            $and: [
              statusOrShipmentStatusIn(DELIVERED_MATCH_VALUES),
              { updatedAt: range },
            ],
          },
        ],
      });
    } else {
      parts.push({ createdAt: range });
    }
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
    const vendorOid = new mongoose.Types.ObjectId(pq.vendorId);
    const vendor = await Vendor.findById(vendorOid).select("_id userId name").lean();
    if (vendor) {
      const linked = await pickupsLinkedToVendor(
        vendorOid,
        vendor.userId as mongoose.Types.ObjectId
      );
      const or: Record<string, unknown>[] = [
        { vendorId: vendorOid },
        { createdBy: vendor.userId },
        { ownerUserId: vendor.userId },
      ];
      if (linked.ids.length > 0) {
        or.push({ pickupAddressId: { $in: linked.ids } });
      }
      // Match embedded pickup snapshots (common when vendorId was never set on the order).
      const names = [
        ...new Set(
          [String(vendor.name ?? "").trim(), ...linked.labels]
            .map((n) => n.trim())
            .filter(Boolean)
        ),
      ];
      for (const name of names) {
        const rx = new RegExp(`^${escapeRegex(name)}$`, "i");
        or.push({ "pickupAddress.label": rx });
        or.push({ "pickupAddress.warehouseName": rx });
        or.push({ "pickupAddress.pickupName": rx });
        or.push({ pickupAddress: rx });
      }
      parts.push({ $or: or });
    } else {
      parts.push({ vendorId: vendorOid });
    }
  }

  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0]! : { $and: parts };
}
