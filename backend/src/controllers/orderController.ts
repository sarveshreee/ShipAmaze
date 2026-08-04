import type { Request, Response } from "express";
import type { Types } from "mongoose";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { Order } from "../models/Order.js";
import { Courier } from "../models/Courier.js";
import { Warehouse } from "../models/Warehouse.js";
import { Vendor } from "../models/Vendor.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { Pickup } from "../models/Pickup.js";
import { pickupByIdSelectableQuery } from "../utils/pickupQuery.js";
import { normalizeOrderStatus, isValidStatusTransition } from "../utils/orderStatus.js";
import {
  buildOrderVisibilityQuery,
  buildTabQuery,
  mergeQueries,
  parseOrderListQuery,
  buildOrderListFiltersQuery,
  type ParsedOrderListQuery,
} from "../utils/orderFilters.js";
import { csvRow, exportFilename } from "../utils/reportQuery.js";
import type { IOrder } from "../models/Order.js";
import { createInAppNotification } from "../services/inAppNotifications.js";
import { orderWalletUserId } from "../services/walletLedger.js";
import { buildPickupSnapshotFromLean } from "../utils/pickupSnapshot.js";
import { resolveVendorIdFromPickup } from "../utils/pickupVendor.js";
import { OrderSkuAudit } from "../models/OrderSkuAudit.js";
import { devLog } from "../utils/devLog.js";
import { ACTIVITY_ACTIONS, recordUserActivity } from "../services/userActivityService.js";
import {
  firstItemArrayFromOrderDoc,
  normalizeLineItem,
  normalizeLineItems,
  syncOrderLineItemArrays,
} from "../utils/orderLineItems.js";
import { getDropshipperAccessType } from "../middleware/dropshipperAccessMiddleware.js";
import { resolveRoutingForSku } from "../services/orderSkuRouting.js";
import { mapToPublicTracking } from "../utils/publicTracking.js";
import { bookForwardShipmentForOrder, syncLocalOrderEditsToVelocity } from "../modules/velocity/velocity.controller.js";
import { bookLorrigoShipment } from "../modules/courier/bookShipment.js";
import { discoverServiceability } from "../modules/courier/discoverCouriers.js";
import { getCourierProvider } from "../modules/courier/providerRegistry.js";
import { providerSupports } from "../modules/courier/capabilities.js";
import type { CourierProviderId } from "../modules/courier/types.js";
import { isLorrigoEnabledFlag } from "../modules/lorrigo/lorrigo.config.js";
import { isVelocityEnabledFlag } from "../config/env.js";
import {
  pickPriorityServiceableCourier,
  type PriorityServiceableCourier,
  type ResolvedServiceableCarrier,
  type ServiceabilityCache,
} from "../modules/velocity/velocity.resolveCarrier.js";
import { normalizePincode } from "../modules/velocity/velocity.payload.js";
import { formatErrorMessage } from "../utils/errorMessage.js";
import {
  getBulkCourierPriority,
  type BulkCourierPriorityCandidate,
} from "../services/bulkCourierPriorityService.js";
import { syncPickupToVelocity } from "../modules/velocity/velocity.warehouseSync.js";
import { velocityConfig } from "../modules/velocity/velocity.config.js";
import { mapWithConcurrency } from "../modules/velocity/velocity.labelPdf.js";

const PROCESS_SELECTED_MAX_ORDERS = 1000;
const ORDER_IDS_MAX = 1000;
const ORDER_EXPORT_MAX_ROWS = 50_000;

/** Exclude heavy blobs from list endpoints — labels/raw payloads fetched on detail/label routes. */
const ORDER_LIST_EXCLUDE = "-labelPdfBase64 -providerBookingRaw -providerEvents -trackingActivities -remarkHistory";
/** Higher concurrency — each order is mostly waiting on Velocity I/O. */
const PROCESS_SELECTED_CONCURRENCY = 10;

function normalizePickupAddressForClient(pickup: unknown): unknown {
  if (pickup == null) return pickup;
  if (typeof pickup === "string") {
    const t = pickup.trim();
    return t || undefined;
  }
  if (typeof pickup !== "object" || Array.isArray(pickup)) return pickup;
  const o = pickup as Record<string, unknown>;
  const label = String(o.label ?? "").trim();
  const warehouseName = String(o.warehouseName ?? "").trim();
  const title = label || warehouseName || "Pickup";
  const contactName = String(o.contactName ?? o.contactPerson ?? "").trim();
  return {
    ...o,
    label: title,
    warehouseName: warehouseName || title,
    pickupName: warehouseName || title,
    contactName,
    contactPerson: contactName,
  };
}

function enrichProductsWithShopifyImages(
  products: unknown[],
  shopifyLineItems: unknown[] | undefined
): unknown[] {
  if (!Array.isArray(products) || products.length === 0) return products;
  const raw = Array.isArray(shopifyLineItems) ? shopifyLineItems : [];

  return products.map((product, idx) => {
    const p = product as Record<string, unknown>;
    if (String(p.imageUrl ?? "").trim()) return product;

    const li = (raw[idx] ??
      raw.find((row) => {
        const r = row as Record<string, unknown>;
        const sku = String(r.sku ?? "").trim().toLowerCase();
        const title = String(r.title ?? r.name ?? "").trim().toLowerCase();
        const pSku = String(p.sku ?? "").trim().toLowerCase();
        const pName = String(p.name ?? p.productName ?? "").trim().toLowerCase();
        return (sku && pSku && sku === pSku) || (title && pName && title === pName);
      })) as Record<string, unknown> | undefined;

    if (!li) return product;

    const imageBlock = li.image as { src?: string; url?: string } | string | undefined;
    const img =
      (typeof imageBlock === "object" && imageBlock
        ? String(imageBlock.src ?? imageBlock.url ?? "").trim()
        : typeof imageBlock === "string"
          ? imageBlock.trim()
          : "") ||
      String((li.featured_image as { url?: string; src?: string } | undefined)?.url ?? "").trim() ||
      String((li.featured_image as { url?: string; src?: string } | undefined)?.src ?? "").trim();

    if (!img) return product;
    return { ...p, imageUrl: img };
  });
}

function mapOrder(o: {
  orderId: string;
  customer: string;
  phone: string;
  address: string;
  city: string;
  state?: string;
  pincode: string;
  weight: string;
  length?: number;
  width?: number;
  breadth?: number;
  height?: number;
  courier: string;
  payment: string;
  status: string;
  date: string;
  awb: string;
  amount: number;
  products: unknown[];
  dimensions?: string;
  zone?: string;
  pickupAddress?: unknown;
  pickupAddressId?: Types.ObjectId;
  pickupWarehouseId?: string;
  createdAt?: Date;
  channel?: string;
  externalSource?: string;
  externalOrderName?: string;
  shipmentCreated?: boolean;
  shipmentId?: string;
  trackingId?: string;
  isJunk?: boolean;
  junkedAt?: Date;
  junkReason?: string;
  shipmentStatus?: string;
  movedToReadyAt?: Date;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress1?: string;
  shippingAddress2?: string;
  shippingPincode?: string;
  shippingCity?: string;
  shippingState?: string;
  velocityWarehouseId?: string;
  velocityOrderId?: string;
  velocityShipmentId?: string;
  velocityReturnId?: string;
  courierCompanyId?: number | string;
  courierName?: string;
  labelUrl?: string;
  manifestUrl?: string;
  shippingCharges?: number;
  codCharges?: number;
  rtoCharges?: number;
  trackingUrl?: string;
  trackingActivities?: { date: string; activity: string; location: string }[];
  items?: unknown[];
  orderItems?: unknown[];
  shopifyLineItems?: unknown[];
  statusHistory?: { status: string; at: Date; updatedBy?: unknown; note?: string }[];
  sourceType?: string;
  updatedAt?: Date;
  shopifyShopDomain?: string;
  shopifyStoreName?: string;
  shopifyOrderNumericId?: string;
  shopifyFinancialStatus?: string;
  shopifyFulfillmentStatus?: string;
  shopifyNote?: string;
  shopifyTags?: string;
  lastShopifySyncAt?: Date;
  adminRemark?: string;
  pickupDate?: Date;
  edd?: Date;
  ownerUserId?: unknown;
  dropshipperId?: unknown;
  createdBy?: unknown;
}) {
  const items = (o.orderItems ?? o.items ?? o.products ?? []) as unknown[];
  const rawProducts = Array.isArray(o.products) && o.products.length > 0 ? o.products : items;
  const productsOut = enrichProductsWithShopifyImages(rawProducts, o.shopifyLineItems);
  return {
    id: o.orderId,
    customer: o.customer,
    phone: o.phone,
    address: o.address,
    city: o.city,
    state: o.state,
    pincode: o.pincode,
    weight: o.weight,
    length: o.length,
    width: o.width,
    breadth: o.breadth,
    height: o.height,
    courier: o.courier,
    payment: o.payment,
    status: o.status,
    date: o.date,
    awb: o.awb,
    amount: o.amount,
    products: productsOut,
    dimensions: o.dimensions,
    zone: o.zone,
    pickupAddress: normalizePickupAddressForClient(o.pickupAddress),
    pickupAddressId: o.pickupAddressId ? String(o.pickupAddressId) : undefined,
    pickupWarehouseId: o.pickupWarehouseId,
    createdAt: o.createdAt,
    channel: o.channel ?? "Manual",
    externalSource: o.externalSource,
    externalOrderName: o.externalOrderName,
    shipmentCreated: Boolean(o.shipmentCreated),
    shipmentId: o.shipmentId,
    trackingId: o.trackingId,
    isJunk: Boolean(o.isJunk),
    junkedAt: o.junkedAt,
    junkReason: o.junkReason,
    shipmentStatus: o.shipmentStatus,
    movedToReadyAt: o.movedToReadyAt,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    shippingAddress1: o.shippingAddress1,
    shippingAddress2: o.shippingAddress2,
    shippingPincode: o.shippingPincode,
    shippingCity: o.shippingCity,
    shippingState: o.shippingState,
    velocityWarehouseId: o.velocityWarehouseId,
    velocityOrderId: o.velocityOrderId,
    velocityShipmentId: o.velocityShipmentId,
    velocityReturnId: o.velocityReturnId,
    courierCompanyId: o.courierCompanyId,
    courierName: o.courierName,
    labelUrl: o.labelUrl,
    manifestUrl: o.manifestUrl,
    shippingCharges: o.shippingCharges,
    codCharges: o.codCharges,
    rtoCharges: o.rtoCharges,
    trackingUrl: o.trackingUrl,
    trackingActivities: o.trackingActivities,
    items,
    orderItems: (o.orderItems ?? items) as unknown[],
    shopifyLineItems: o.shopifyLineItems,
    statusHistory: (o.statusHistory ?? []).map((e) => ({
      status: e.status,
      at: e.at instanceof Date ? e.at.toISOString() : String(e.at),
      updatedBy: e.updatedBy ? String(e.updatedBy) : undefined,
      note: e.note,
    })),
    sourceType: o.sourceType ?? o.channel ?? "Manual",
    updatedAt: o.updatedAt,
    shopifyShopDomain: o.shopifyShopDomain,
    shopifyStoreName: o.shopifyStoreName,
    shopifyOrderNumericId: o.shopifyOrderNumericId,
    shopifyFinancialStatus: o.shopifyFinancialStatus,
    shopifyFulfillmentStatus: o.shopifyFulfillmentStatus,
    shopifyNote: o.shopifyNote,
    shopifyTags: o.shopifyTags,
    adminRemark: o.adminRemark,
    ownerUserId: o.ownerUserId ? String(o.ownerUserId) : undefined,
    dropshipperId: o.dropshipperId ? String(o.dropshipperId) : undefined,
    pickupDate: o.pickupDate instanceof Date ? o.pickupDate.toISOString() : o.pickupDate ? String(o.pickupDate) : undefined,
    edd: o.edd instanceof Date ? o.edd.toISOString() : o.edd ? String(o.edd) : undefined,
    lastShopifySyncAt:
      o.lastShopifySyncAt instanceof Date ? o.lastShopifySyncAt.toISOString() : o.lastShopifySyncAt
        ? String(o.lastShopifySyncAt)
        : undefined,
  };
}

async function vendorDocForUser(userId: Types.ObjectId) {
  return Vendor.findOne({ userId });
}

async function assertOrderAccess(
  user: NonNullable<AuthRequest["user"]>,
  order: {
    createdBy?: unknown;
    ownerUserId?: unknown;
    vendorId?: unknown;
    dropshipperId?: unknown;
    pickupAddressId?: unknown;
  }
) {
  if (user.role === "admin") return;
  if (user.role === "vendor") {
    const v = await vendorDocForUser(user._id);
    if (v && String(order.vendorId ?? "") === String(v._id)) return;
    if (String(order.createdBy) === String(user._id)) return;
    if (order.pickupAddressId) {
      const pickup = await Pickup.findOne({
        _id: order.pickupAddressId,
        userId: user._id,
        $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }],
      })
        .select("_id")
        .lean();
      if (pickup) return;
    }
    throw new AppError(403, "Forbidden");
  }
  const owned =
    String(order.createdBy) === String(user._id) ||
    String(order.ownerUserId ?? "") === String(user._id) ||
    String(order.dropshipperId ?? "") === String(user._id);
  if (!owned) throw new AppError(403, "Forbidden");
}

function appendStatusHistory(order: IOrder, status: string, userId: Types.ObjectId | undefined, note?: string) {
  const ev = { status, at: new Date(), updatedBy: userId, note };
  const h = order.statusHistory ?? [];
  h.push(ev);
  order.statusHistory = h;
  order.markModified("statusHistory");
}

async function applyOrderRoutingFromSku(order: IOrder, sku: string) {
  const routing = await resolveRoutingForSku(sku);
  if (!routing) return null;

  if (routing.vendorId && mongoose.isValidObjectId(routing.vendorId)) {
    order.vendorId = new mongoose.Types.ObjectId(routing.vendorId);
  }
  if (routing.warehouseId) {
    order.pickupWarehouseId = routing.warehouseId;
  }
  if (routing.velocityWarehouseId) {
    order.velocityWarehouseId = routing.velocityWarehouseId;
  }
  if (routing.pickupAddressSnapshot) {
    order.pickupAddress = routing.pickupAddressSnapshot;
    order.pickupAddressId = undefined;
  }

  return routing;
}

function extractItemsFromBody(body: Record<string, unknown>): unknown[] {
  const raw = (body.orderItems ?? body.items ?? body.products) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter((row) => row !== null && row !== undefined);
}

function validateOrderItems(items: unknown[], opts?: { requireSku?: boolean }): void {
  if (items.length === 0) throw new AppError(400, "At least one order line item is required");
  for (const row of items) {
    const o = row as Record<string, unknown>;
    const name = String(o.name ?? o.title ?? "").trim();
    const qty = Number(o.qty ?? o.quantity ?? o.units ?? 0);
    const price = Number(o.price ?? o.sellingPrice ?? o.amount ?? 0);
    if (!name) throw new AppError(400, "Each item must have a name");
    if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
      throw new AppError(400, "Each item must have a valid quantity (whole number ≥ 1)");
    }
    if (!Number.isFinite(price) || price < 0) throw new AppError(400, "Each item must have a valid price (≥ 0)");
    if (opts?.requireSku) {
      const sku = String(o.sku ?? "").trim();
      if (!sku) throw new AppError(400, "Each line item must have a non-empty SKU");
    }
  }
}

function sumItemsAmount(items: unknown[]): number {
  let t = 0;
  for (const row of items) {
    const o = row as Record<string, unknown>;
    const qty = Number(o.qty ?? o.quantity ?? o.units ?? 1);
    const price = Number(o.price ?? o.sellingPrice ?? o.amount ?? 0);
    t += qty * price;
  }
  return Math.round(t * 100) / 100;
}

async function buildOrdersListMongoQuery(
  user: NonNullable<AuthRequest["user"]>,
  queryParams: Record<string, unknown>
): Promise<{ query: Record<string, unknown>; pq: ParsedOrderListQuery; view: string }> {
  const view = String(queryParams.view ?? "").toLowerCase();
  const pq = parseOrderListQuery(queryParams);
  const visibility = await buildOrderVisibilityQuery(user);

  let query: Record<string, unknown> = { ...visibility };
  if (view === "junk") {
    query = mergeQueries(query, { isJunk: true });
  } else if (String(pq.tab ?? "").toLowerCase() !== "all") {
    query = mergeQueries(query, { isJunk: { $ne: true } });
  }

  if (view !== "junk" && pq.tab) {
    const tq = buildTabQuery(pq.tab);
    if (tq) query = mergeQueries(query, tq);
  }

  const listFilters = await buildOrderListFiltersQuery(pq);
  if (listFilters) query = mergeQueries(query, listFilters);
  return { query, pq, view };
}

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function orderLineItems(o: Record<string, unknown>): Array<Record<string, unknown>> {
  for (const key of ["products", "orderItems", "items", "shopifyLineItems"]) {
    const v = o[key];
    if (Array.isArray(v) && v.length > 0) return v as Array<Record<string, unknown>>;
  }
  return [];
}

function joinProductField(items: Array<Record<string, unknown>>, keys: string[]): string {
  return items
    .map((it) => firstNonEmpty(...keys.map((k) => it[k])))
    .filter(Boolean)
    .join(" | ");
}

export const listOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  if (String(req.query.legacy ?? "") === "1") {
    const visibility = await buildOrderVisibilityQuery(req.user);
    const view = String(req.query.view ?? "").toLowerCase();
    let query: Record<string, unknown> = { ...visibility };
    if (view === "junk") query = mergeQueries(query, { isJunk: true });
    else query = mergeQueries(query, { isJunk: { $ne: true } });
    // Cap legacy list — full unbounded scan was a major perf hotspot (command palette / analytics)
    const rows = await Order.find(query)
      .select(ORDER_LIST_EXCLUDE)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json(rows.map((o) => mapOrder(o)));
    return;
  }

  const { query, pq } = await buildOrdersListMongoQuery(
    req.user,
    req.query as Record<string, unknown>
  );
  const visibility = await buildOrderVisibilityQuery(req.user);
  const listFilters = await buildOrderListFiltersQuery(pq);

  let tabCounts: Record<string, number> | undefined;
  if (pq.counts) {
    const tabList = [
      "all",
      "channel",
      "manual",
      "ready-to-ship",
      "pending-pickup",
      "in-transit",
      "out-for-delivery",
      "delivered",
      "reship",
      "failed",
    ];
    tabCounts = {};
    const countEntries = await Promise.all(
      tabList.map(async (tab) => {
        let q2: Record<string, unknown> = { ...visibility };
        if (tab !== "all") {
          q2 = mergeQueries(q2, { isJunk: { $ne: true } });
        }
        const tq = buildTabQuery(tab);
        if (tq) q2 = mergeQueries(q2, tq);
        if (listFilters) q2 = mergeQueries(q2, listFilters);
        const n = await Order.countDocuments(q2);
        return [tab, n] as const;
      })
    );
    for (const [tab, n] of countEntries) {
      tabCounts[tab] = n;
    }
    tabCounts.junk = await Order.countDocuments(
      mergeQueries({ ...visibility, isJunk: true }, listFilters ?? {})
    );
  }

  const skip = (pq.page - 1) * pq.pageSize;
  const [rows, total] = await Promise.all([
    Order.find(query).select(ORDER_LIST_EXCLUDE).sort({ createdAt: -1 }).skip(skip).limit(pq.pageSize).lean(),
    Order.countDocuments(query),
  ]);

  const mappedRows = rows.map((o) => mapOrder(o));

  res.json({
    orders: mappedRows,
    total,
    page: pq.page,
    pageSize: pq.pageSize,
    ...(tabCounts ? { tabCounts } : {}),
  });
});

/** Fetch full order rows by orderId list (for bulk print across pages). */
export const getOrdersByIds = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const raw = (req.body as { orderIds?: unknown }).orderIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(400, "orderIds must be a non-empty array");
  }
  const ids = [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) throw new AppError(400, "orderIds must not be empty");
  if (ids.length > ORDER_IDS_MAX) {
    throw new AppError(400, `Maximum ${ORDER_IDS_MAX} orders per request`);
  }
  const visibility = await buildOrderVisibilityQuery(req.user);
  const rows = await Order.find(mergeQueries(visibility, { orderId: { $in: ids } })).lean();
  const byId = new Map(rows.map((o) => [String(o.orderId), o]));
  // Preserve request order; skip missing ids silently
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  res.json({ orders: ordered.map((o) => mapOrder(o!)), total: ordered.length });
});

/** Order IDs matching the same filters as the list (capped for bulk select / process). */
export const listOrderIds = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { query } = await buildOrdersListMongoQuery(req.user, req.query as Record<string, unknown>);
  const limit = Math.min(
    ORDER_IDS_MAX,
    Math.max(1, parseInt(String((req.query as { limit?: string }).limit ?? ORDER_IDS_MAX), 10) || ORDER_IDS_MAX)
  );
  const total = await Order.countDocuments(query);
  const rows = await Order.find(query).sort({ createdAt: -1 }).select("orderId").limit(limit).lean();
  res.json({
    ids: rows.map((r) => String(r.orderId)),
    total,
    capped: total > limit,
    limit,
  });
});

/** Stream all matching orders as CSV (not limited to the UI page size). */
export const exportOrdersCsv = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const bodyIds = Array.isArray((req.body as { orderIds?: unknown })?.orderIds)
    ? (req.body as { orderIds: unknown[] }).orderIds.map((x) => String(x).trim()).filter(Boolean)
    : [];

  let query: Record<string, unknown>;
  if (bodyIds.length > 0) {
    const visibility = await buildOrderVisibilityQuery(req.user);
    query = mergeQueries(visibility, { orderId: { $in: [...new Set(bodyIds)].slice(0, ORDER_EXPORT_MAX_ROWS) } });
  } else {
    ({ query } = await buildOrdersListMongoQuery(req.user, req.query as Record<string, unknown>));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${exportFilename("orders")}"`);
  res.write(
    csvRow([
      "Order Account",
      "OrderId",
      "Channel Order Number",
      "Channel Order Date",
      "WayBill Number",
      "Pre Generated WayBill",
      "Order Date",
      "Ref.Invoice #",
      "Mode",
      "Express",
      "Pickup Warehouse",
      "Consignee Name",
      "Consignee Contact",
      "Alternate Number",
      "Address",
      "City",
      "State",
      "Pincode",
      "Product Name",
      "SKU",
      "Product Qty",
      "Product Value",
      "Order Amount",
      "Extra Charges",
      "Total Amount",
      "COD Amount",
      "Dimensions",
      "Weight",
      "Fulfilled By",
      "Status",
      "Added On",
      "Delivered Date",
      "RTS Date",
      "Client Order ID",
    ])
  );

  let count = 0;
  let truncated = false;
  const cursor = Order.find(query).sort({ createdAt: -1 }).lean().cursor();
  for await (const o of cursor) {
    if (count >= ORDER_EXPORT_MAX_ROWS) {
      truncated = true;
      break;
    }
    const row = o as unknown as Record<string, unknown>;
    const items = orderLineItems(row);
    const pickup =
      row.pickupAddress && typeof row.pickupAddress === "object"
        ? (row.pickupAddress as Record<string, unknown>)
        : null;
    const totalAmount = Number(row.amount ?? 0) || 0;
    const shipping = Number(row.shippingCharges ?? 0) || 0;
    const codCharges = Number(row.codCharges ?? 0) || 0;
    const extraCharges = shipping + codCharges;
    const payment = String(row.payment ?? "");
    const codAmount = payment.toUpperCase() === "COD" ? totalAmount : codCharges || "";
    const dims = firstNonEmpty(
      row.dimensions,
      [row.length, row.breadth ?? row.width, row.height].filter((x) => x != null && String(x) !== "").join("x")
    );
    const productValue = items.reduce((sum, it) => {
      const price = Number(it.price ?? it.productPrice ?? it.value ?? 0) || 0;
      return sum + price;
    }, 0);

    res.write(
      csvRow([
        firstNonEmpty(row.shopifyShopDomain, row.externalSource),
        firstNonEmpty(row.externalOrderName, row.orderId),
        firstNonEmpty(row.externalOrderName, row.shopifyOrderNumericId),
        firstNonEmpty(row.lastShopifySyncAt, row.date),
        firstNonEmpty(row.awb, row.trackingId),
        firstNonEmpty(row.trackingId),
        firstNonEmpty(row.date),
        firstNonEmpty(row.shopifyOrderNumericId),
        payment,
        "",
        firstNonEmpty(
          typeof row.pickupAddress === "string" ? row.pickupAddress : "",
          pickup?.label,
          pickup?.warehouseName,
          pickup?.pickupName
        ),
        firstNonEmpty(row.customer),
        firstNonEmpty(row.customerPhone, row.phone),
        "",
        firstNonEmpty(row.shippingAddress1, row.address),
        firstNonEmpty(row.shippingCity, row.city),
        firstNonEmpty(row.shippingState, row.state),
        firstNonEmpty(row.shippingPincode, row.pincode),
        joinProductField(items, ["productName", "name", "title"]),
        joinProductField(items, ["sku", "productCode"]),
        joinProductField(items, ["qty", "quantity"]),
        productValue || joinProductField(items, ["price", "productPrice", "value"]),
        totalAmount,
        extraCharges || "",
        totalAmount + extraCharges,
        codAmount,
        dims,
        firstNonEmpty(row.weight),
        firstNonEmpty(row.courierName, row.courier),
        firstNonEmpty(row.shopifyFulfillmentStatus, row.shipmentStatus, row.status),
        firstNonEmpty(row.createdAt, row.movedToReadyAt, row.updatedAt, row.date),
        firstNonEmpty(row.edd),
        "",
        firstNonEmpty(row.externalOrderName, row.shopifyOrderNumericId, row.orderId),
      ])
    );
    count += 1;
  }
  if (truncated) res.write(csvRow(["__truncated__", `Export limited to ${ORDER_EXPORT_MAX_ROWS} rows`]));
  res.end();
});

export const createOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = req.body as Record<string, unknown>;
  const vendor = req.user.role === "vendor" ? await vendorDocForUser(req.user._id) : null;

  const requestedId = String(body.orderId ?? "").trim();
  const orderId =
    requestedId || `SA-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const existingOrder = await Order.findOne({ orderId });
  if (existingOrder) {
    throw new AppError(400, `Order ID "${orderId}" already exists. Please use a different order ID.`);
  }

  const isDraft = String(body.status ?? "").toLowerCase() === "draft" || body.isDraft === true;

  let pickupAddressId: Types.ObjectId | undefined;
  const rawPid = body.pickupAddressId ?? body.pickupWarehouseId;
  if (rawPid != null && String(rawPid).trim() !== "") {
    if (!mongoose.isValidObjectId(String(rawPid))) throw new AppError(400, "Invalid pickupAddressId");
    const p = await Pickup.findOne(pickupByIdSelectableQuery(String(rawPid), req.user));
    if (!p) throw new AppError(400, "Pickup address not found or not allowed");
    pickupAddressId = p._id;
  }

  let snapshotVelocityWh: string | undefined;
  let pickupSnapshot: ReturnType<typeof buildPickupSnapshotFromLean>["snapshot"] | undefined;
  if (pickupAddressId) {
    const pu = await Pickup.findById(pickupAddressId)
      .select(
        "label contactName phone alternatePhone email addressLine1 addressLine2 landmark city state pincode country gstin velocityWarehouseId"
      )
      .lean();
    if (pu) {
      const built = buildPickupSnapshotFromLean(pu, pickupAddressId);
      pickupSnapshot = built.snapshot;
      snapshotVelocityWh = built.velocityWarehouseId;
    }
  }

  const rawCarrierPref = body.carrier_id;
  let carrierPref: string | number | undefined;
  if (rawCarrierPref !== undefined && rawCarrierPref !== null && String(rawCarrierPref).trim() !== "") {
    const s = String(rawCarrierPref).trim();
    carrierPref = /^\d+$/.test(s) ? Number(s) : s;
  }

  const lineItems = extractItemsFromBody(body);
  const payment = String(body.payment ?? "Prepaid");
  if (!["COD", "Prepaid"].includes(payment)) {
    throw new AppError(400, "payment must be COD or Prepaid");
  }

  if (isDraft) {
    const customer = String(body.customer ?? "").trim();
    if (!customer) throw new AppError(400, "Customer name is required to save a draft");
    let amount = Number(body.amount ?? body.invoiceValue ?? body.codAmount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) amount = 0;
    const goodItems = lineItems.filter((row) => String((row as Record<string, unknown>).name ?? "").trim());
    if (goodItems.length > 0) {
      validateOrderItems(goodItems);
      const sum = sumItemsAmount(goodItems);
      if (amount === 0) amount = sum;
    }
    const shippingAddress1 = String(body.shippingAddress1 ?? body.addressLine1 ?? body.address ?? "");
    const shippingCity = String(body.shippingCity ?? body.city ?? "");
    const shippingState = String(body.shippingState ?? body.state ?? "");
    const pin = String(body.shippingPincode ?? body.pincode ?? "").replace(/\D/g, "").slice(0, 6);
    const doc = await Order.create({
      orderId,
      customer,
      phone: String(body.phone ?? ""),
      address: shippingAddress1,
      city: shippingCity,
      state: shippingState,
      pincode: pin,
      weight: String(body.weight ?? "0.5").replace(/[^\d.]/g, "") || "0.5",
      courier: String(body.courier ?? "Delhivery"),
      payment,
      status: "draft",
      date: String(body.date ?? new Date().toISOString().slice(0, 10)),
      awb: "",
      amount,
      products: goodItems.length ? goodItems : lineItems,
      items: goodItems.length ? goodItems : lineItems,
      orderItems: goodItems.length ? goodItems : lineItems,
      pickupAddress: pickupSnapshot ?? (body.pickupAddress as string | undefined),
      pickupAddressId,
      pickupWarehouseId: pickupAddressId ? String(pickupAddressId) : undefined,
      createdBy: req.user._id,
      ownerUserId: req.user._id,
      dropshipperId: req.user.role === "dropshipper" ? req.user._id : undefined,
      vendorId: vendor?._id,
      channel: String(body.channel ?? "Manual"),
      sourceType: String(body.sourceType ?? "Manual"),
      customerEmail: String(body.customerEmail ?? body.email ?? ""),
      customerPhone: String(body.customerPhone ?? body.phone ?? ""),
      shippingAddress1,
      shippingAddress2: String(body.shippingAddress2 ?? body.addressLine2 ?? ""),
      shippingPincode: pin,
      shippingCity,
      shippingState,
      velocityWarehouseId: snapshotVelocityWh,
      courierCompanyId: carrierPref,
    });
    appendStatusHistory(doc, "draft", req.user._id);
    await doc.save();
    res.status(201).json(mapOrder(doc));
    return;
  }

  validateOrderItems(lineItems);

  const shippingAddress1 = String(body.shippingAddress1 ?? body.addressLine1 ?? body.address ?? "");
  const shippingAddress2 = String(body.shippingAddress2 ?? body.addressLine2 ?? "");
  const shippingCity = String(body.shippingCity ?? body.city ?? "");
  const shippingState = String(body.shippingState ?? body.state ?? "");
  const shippingPincode = String(body.shippingPincode ?? body.pincode ?? "");
  const shippingPincodeDigits = shippingPincode.replace(/\D/g, "").slice(0, 6);
  const rawLength = Number(body.length ?? 0);
  const rawWidth = Number(body.width ?? body.breadth ?? 0);
  const rawHeight = Number(body.height ?? 0);

  if (!shippingState.trim()) throw new AppError(400, "shippingState/state is required");
  if (!/^\d{6}$/.test(shippingPincodeDigits)) {
    throw new AppError(400, "shippingPincode/pincode must be exactly 6 digits");
  }
  const normalizedWeight = Number(String(body.weight ?? "").replace(/[^\d.]/g, ""));
  if (!(normalizedWeight > 0)) throw new AppError(400, "weight must be greater than 0");
  if (!(rawLength > 0) || !(rawWidth > 0) || !(rawHeight > 0)) {
    throw new AppError(400, "length, breadth/width and height must be greater than 0");
  }
  if (!pickupAddressId) {
    throw new AppError(400, "pickupAddressId is required and must belong to your account");
  }

  let amount = Number(body.amount ?? body.codAmount ?? body.invoiceValue ?? 0);
  const computed = sumItemsAmount(lineItems);
  if (!Number.isFinite(amount) || amount < 0) amount = computed;
  if (payment === "COD" && amount === 0 && computed > 0) amount = computed;
  if (amount < 0) throw new AppError(400, "Order amount cannot be negative");

  const isManualOrder =
    String(body.channel ?? "Manual").toLowerCase() !== "shopify" &&
    String(body.externalSource ?? "").toLowerCase() !== "shopify" &&
    !(String(body.externalSource ?? "").trim() && String(body.externalSource ?? "").toLowerCase() !== "manual");

  const defaultStatus = isManualOrder ? "pending" : "ready_to_ship";
  let statusStored = normalizeOrderStatus(String(body.status ?? defaultStatus));
  if (!isManualOrder && statusStored === "draft") statusStored = "ready_to_ship";
  if (isManualOrder && statusStored === "ready_to_ship") statusStored = "draft";

  const doc = await Order.create({
    orderId,
    customer: String(body.customer ?? ""),
    phone: String(body.phone ?? ""),
    address: shippingAddress1 || String(body.address ?? ""),
    city: shippingCity,
    state: shippingState,
    pincode: shippingPincodeDigits,
    weight: String(normalizedWeight),
    length: rawLength > 0 ? rawLength : undefined,
    width: rawWidth > 0 ? rawWidth : undefined,
    breadth: rawWidth > 0 ? rawWidth : undefined,
    height: rawHeight > 0 ? rawHeight : undefined,
    courier: String(body.courier ?? "Delhivery"),
    payment,
    status: statusStored,
    date: String(body.date ?? new Date().toISOString().slice(0, 10)),
    awb: String(body.awb ?? "").trim(),
    amount,
    products: lineItems,
    items: lineItems,
    orderItems: lineItems,
    dimensions: body.dimensions as string | undefined,
    zone: body.zone as string | undefined,
    pickupAddress: pickupSnapshot ?? (body.pickupAddress as string | undefined),
    pickupAddressId,
    pickupWarehouseId: pickupAddressId ? String(pickupAddressId) : undefined,
    createdBy: req.user._id,
    ownerUserId: req.user._id,
    dropshipperId: req.user.role === "dropshipper" ? req.user._id : undefined,
    vendorId: vendor?._id,
    channel: String(body.channel ?? "Manual"),
    sourceType: String(body.sourceType ?? "Manual"),
    customerEmail: String(body.customerEmail ?? body.email ?? ""),
    customerPhone: String(body.customerPhone ?? body.phone ?? ""),
    shippingAddress1,
    shippingAddress2,
    shippingPincode: shippingPincodeDigits,
    shippingCity,
    shippingState,
    velocityWarehouseId: snapshotVelocityWh,
    courierCompanyId: carrierPref,
  });
  appendStatusHistory(doc, String(doc.status), req.user._id, "created");
  await doc.save();
  await createInAppNotification(
    req.user._id,
    "order_created",
    `Order ${orderId} created`,
    `Customer: ${doc.customer}. Amount: ₹${doc.amount}.`,
    { orderId }
  );
  recordUserActivity({
    user: req.user,
    module: "order",
    action: ACTIVITY_ACTIONS.ORDER_CREATED,
    req,
    metadata: { orderId },
  });
  res.status(201).json(mapOrder(doc));
});

export const createOrdersBulk = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const items = (req.body as { orders?: unknown[] }).orders;
  if (!Array.isArray(items)) throw new AppError(400, "Expected { orders: [] }");
  const vendor =
    req.user.role === "vendor" ? await vendorDocForUser(req.user._id) : null;
  const created = [];
  for (const raw of items) {
    const body = raw as Record<string, unknown>;
    const orderId = (body.orderId as string) || `SF${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const exists = await Order.findOne({ orderId });
    if (exists) throw new AppError(400, `Order ID "${orderId}" already exists.`);
    const doc = await Order.create({
      orderId,
      customer: String(body.customer ?? ""),
      phone: String(body.phone ?? ""),
      address: String(body.address ?? ""),
      city: String(body.city ?? ""),
      pincode: String(body.pincode ?? ""),
      weight: String(body.weight ?? ""),
      courier: String(body.courier ?? "Delhivery"),
      payment: String(body.payment ?? "Prepaid"),
      status: String(body.status ?? "pending"),
      date: String(body.date ?? new Date().toISOString().slice(0, 10)),
      awb: String(body.awb ?? ""),
      amount: Number(body.amount ?? 0),
      products: (body.products as unknown[]) ?? [],
      items: (body.items as unknown[]) ?? (body.products as unknown[]) ?? [],
      orderItems: (body.orderItems as unknown[]) ?? (body.items as unknown[]) ?? (body.products as unknown[]) ?? [],
      dimensions: body.dimensions as string | undefined,
      zone: body.zone as string | undefined,
      pickupAddress: body.pickupAddress as string | undefined,
      createdBy: req.user._id,
      ownerUserId: req.user._id,
      dropshipperId: req.user.role === "dropshipper" ? req.user._id : undefined,
      vendorId: vendor?._id,
      channel: String(body.channel ?? "Manual"),
    });
    created.push(mapOrder(doc));
  }
  res.status(201).json({ created: created.length, orders: created });
});

export const updateOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { orderId } = req.params;
  const body = req.body as Record<string, unknown>;
  const order = await Order.findOne({ orderId });
  if (!order) throw new AppError(404, "Order not found");
  await assertOrderAccess(req.user, order);

  const customerName = String(body.customerName ?? body.consigneeName ?? body.customer ?? "").trim();
  const customerEmail = String(body.customerEmail ?? body.email ?? "").trim();
  const customerPhoneRaw = String(body.customerPhone ?? body.phone ?? "").trim();
  const shippingAddress1 = String(body.shippingAddress1 ?? body.address1 ?? body.address ?? "").trim();
  const shippingAddress2 = String(body.shippingAddress2 ?? body.address2 ?? "").trim();
  const shippingCity = String(body.shippingCity ?? body.city ?? "").trim();
  const shippingState = String(body.shippingState ?? body.state ?? "").trim();
  const shippingPincode = String(body.shippingPincode ?? body.customerPincode ?? body.pincode ?? "").replace(/\D/g, "").slice(0, 6);
  const rawWeight = Number(body.weight ?? body.packageWeight ?? body.deadWeight ?? NaN);
  const rawLength = Number(body.length ?? body.packageLength ?? NaN);
  const rawWidth = Number(body.breadth ?? body.width ?? body.packageBreadth ?? body.packageWidth ?? NaN);
  const rawHeight = Number(body.height ?? body.packageHeight ?? NaN);

  if (shippingPincode && !/^\d{6}$/.test(shippingPincode)) {
    throw new AppError(400, "shippingPincode must be exactly 6 digits");
  }
  if (customerPhoneRaw) {
    const digits = customerPhoneRaw.replace(/\D/g, "");
    if (digits.length < 10) throw new AppError(400, "customerPhone must be a valid phone number");
  }
  if (!Number.isNaN(rawWeight) && rawWeight <= 0) throw new AppError(400, "weight must be greater than 0");
  if (!Number.isNaN(rawLength) && rawLength <= 0) throw new AppError(400, "length must be greater than 0");
  if (!Number.isNaN(rawWidth) && rawWidth <= 0) throw new AppError(400, "breadth/width must be greater than 0");
  if (!Number.isNaN(rawHeight) && rawHeight <= 0) throw new AppError(400, "height must be greater than 0");

  if (customerName) order.customer = customerName;
  if (customerEmail || body.customerEmail === "" || body.email === "") order.customerEmail = customerEmail;
  if (customerPhoneRaw) {
    order.customerPhone = customerPhoneRaw;
    order.phone = customerPhoneRaw;
  }
  if (shippingAddress1) {
    order.shippingAddress1 = shippingAddress1;
    order.address = [shippingAddress1, shippingAddress2 || order.shippingAddress2 || ""].filter(Boolean).join(", ");
  }
  if (shippingAddress2 || body.shippingAddress2 === "" || body.address2 === "") {
    order.shippingAddress2 = shippingAddress2;
    order.address = [order.shippingAddress1 || shippingAddress1 || "", shippingAddress2].filter(Boolean).join(", ");
  }
  if (shippingCity) {
    order.shippingCity = shippingCity;
    order.city = shippingCity;
  }
  if (shippingState) {
    order.shippingState = shippingState;
    order.state = shippingState;
  }
  if (shippingPincode) {
    order.shippingPincode = shippingPincode;
    order.pincode = shippingPincode;
  }
  if (!Number.isNaN(rawWeight) && rawWeight > 0) {
    order.weight = String(rawWeight);
  }
  if (!Number.isNaN(rawLength) && rawLength > 0) order.length = rawLength;
  if (!Number.isNaN(rawWidth) && rawWidth > 0) {
    order.width = rawWidth;
    order.breadth = rawWidth;
  }
  if (!Number.isNaN(rawHeight) && rawHeight > 0) order.height = rawHeight;

  const l = order.length;
  const w = order.width ?? order.breadth;
  const h = order.height;
  if (l && w && h) {
    order.dimensions = `${l}x${w}x${h} cm`;
  }

  const hasLineItemsUpdate =
    body.orderItems !== undefined || body.items !== undefined || body.products !== undefined;
  if (hasLineItemsUpdate) {
    if (req.user.role !== "admin") throw new AppError(403, "Only admin can update line items and SKU");
    const lineItems = extractItemsFromBody(body);
    if (lineItems.length === 0) {
      throw new AppError(400, "orderItems must be a non-empty array when updating line items");
    }
    validateOrderItems(lineItems, { requireSku: true });
    const normalized = normalizeLineItems(lineItems);
    order.products = normalized;
    order.items = normalized;
    order.orderItems = normalized;
    order.markModified("products");
    order.markModified("items");
    order.markModified("orderItems");
    const amt = body.amount;
    if (amt !== undefined && amt !== null && String(amt).trim() !== "") {
      const n = Number(amt);
      if (!Number.isFinite(n) || n < 0) throw new AppError(400, "amount must be a valid number ≥ 0");
      order.amount = n;
    } else {
      order.amount = sumItemsAmount(normalized);
    }
  }

  const rawPickupUpdate = body.pickupAddressId ?? body.pickupWarehouseId;
  let pickupChanged = false;
  if (rawPickupUpdate !== undefined) {
    const s = String(rawPickupUpdate ?? "").trim();
    if (s === "") {
      const st = String(order.status ?? "").toLowerCase();
      if (st !== "draft") {
        throw new AppError(400, "pickupAddressId cannot be cleared except on draft orders");
      }
      order.pickupAddressId = undefined;
      order.pickupWarehouseId = undefined;
      order.pickupAddress = undefined;
      order.velocityWarehouseId = undefined;
    } else {
      if (!mongoose.isValidObjectId(s)) throw new AppError(400, "Invalid pickupAddressId");
      const p = await Pickup.findOne(pickupByIdSelectableQuery(s, req.user));
      if (!p) throw new AppError(400, "Pickup address not found or not allowed");
      const pu = await Pickup.findById(p._id)
        .select(
          "label contactName phone alternatePhone email addressLine1 addressLine2 landmark city state pincode country gstin velocityWarehouseId"
        )
        .lean();
      if (!pu) throw new AppError(400, "Pickup address not found");
      const built = buildPickupSnapshotFromLean(pu, p._id);
      order.pickupAddressId = p._id;
      order.pickupWarehouseId = String(p._id);
      order.pickupAddress = built.snapshot;
      order.velocityWarehouseId = built.velocityWarehouseId;
      pickupChanged = true;
    }
  }

  if (body.adminRemark !== undefined || body.remarks !== undefined) {
    order.adminRemark = String(body.adminRemark ?? body.remarks ?? "").slice(0, 2000);
  }

  const amtOnly = body.amount;
  if (amtOnly !== undefined && amtOnly !== null && String(amtOnly).trim() !== "" && !hasLineItemsUpdate) {
    const n = Number(amtOnly);
    if (!Number.isFinite(n) || n < 0) throw new AppError(400, "amount must be a valid number ≥ 0");
    order.amount = n;
  }

  const payRaw = body.payment;
  if (payRaw !== undefined && payRaw !== null && String(payRaw).trim() !== "") {
    const p = String(payRaw).trim();
    if (!["COD", "Prepaid"].includes(p)) throw new AppError(400, "payment must be COD or Prepaid");
    order.payment = p;
  }

  await order.save();

  const shouldSyncVelocity =
    pickupChanged ||
    customerName ||
    customerEmail ||
    customerPhoneRaw ||
    shippingAddress1 ||
    shippingAddress2 ||
    shippingCity ||
    shippingState ||
    shippingPincode ||
    hasLineItemsUpdate ||
    (!Number.isNaN(rawWeight) && rawWeight > 0) ||
    amtOnly !== undefined;

  let velocitySync: { synced: boolean; reason?: string } | undefined;
  if (shouldSyncVelocity) {
    velocitySync = await syncLocalOrderEditsToVelocity(req.user, order, { pickupChanged }).catch(
      (err: unknown) => ({
        synced: false,
        reason: err instanceof Error ? err.message : "sync_failed",
      })
    );
  }

  recordUserActivity({
    user: req.user,
    module: "order",
    action: ACTIVITY_ACTIONS.ORDER_UPDATED,
    req,
    metadata: { orderId: order.orderId },
  });

  res.json({ ...mapOrder(order), velocitySync });
});

/** Update SKU on a single line item with audit trail. */
export const patchOrderLineItemSku = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Only admin can change SKU");

  const { orderId } = req.params;
  const lineIndex = Number(req.params.lineIndex);
  if (!Number.isInteger(lineIndex) || lineIndex < 0) throw new AppError(400, "Invalid line index");

  const body = req.body as { sku?: unknown };
  const newSku = String(body.sku ?? "").trim();
  if (!newSku) throw new AppError(400, "SKU cannot be empty");

  const order = await Order.findOne({ orderId });
  if (!order) throw new AppError(404, "Order not found");
  await assertOrderAccess(req.user, order);

  const lines = firstItemArrayFromOrderDoc(order);
  if (lineIndex >= lines.length) throw new AppError(400, "Line index out of range");

  const current = lines[lineIndex];
  const oldSku = String(current.sku ?? "").trim();
  if (oldSku === newSku) {
    res.json({ order: mapOrder(order), audit: null, unchanged: true });
    return;
  }

  const productName = String(current.name ?? current.productName ?? "").trim();
  current.sku = newSku;
  current.productSku = newSku;
  lines[lineIndex] = normalizeLineItem(current);
  syncOrderLineItemArrays(order, lines);

  const routing = await applyOrderRoutingFromSku(order, newSku);

  const audit = await OrderSkuAudit.create({
    orderId: order.orderId,
    lineIndex,
    oldSku: oldSku || "—",
    newSku,
    productName: productName || undefined,
    updatedBy: req.user._id,
    updatedByName: req.user.name,
  });

  appendStatusHistory(
    order,
    String(order.status ?? "pending"),
    req.user._id,
    [
      `SKU updated line ${lineIndex + 1}: "${oldSku || "—"}" → "${newSku}"`,
      routing?.vendorName ? `vendor=${routing.vendorName}` : null,
      routing?.warehouseName ? `warehouse=${routing.warehouseName}` : null,
    ]
      .filter(Boolean)
      .join(" | ")
  );

  await order.save();
  res.json({
    order: mapOrder(order),
    audit: {
      id: String(audit._id),
      orderId: audit.orderId,
      lineIndex: audit.lineIndex,
      oldSku: audit.oldSku,
      newSku: audit.newSku,
      productName: audit.productName,
      updatedBy: String(audit.updatedBy),
      updatedByName: audit.updatedByName,
      createdAt: audit.createdAt,
    },
    routing,
  });
});

export const listOrderSkuAudit = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { orderId } = req.params;
  const order = await Order.findOne({ orderId }).select("orderId createdBy ownerUserId vendorId dropshipperId");
  if (!order) throw new AppError(404, "Order not found");
  await assertOrderAccess(req.user, order);
  const rows = await OrderSkuAudit.find({ orderId }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({
    items: rows.map((r) => ({
      id: String(r._id),
      lineIndex: r.lineIndex,
      oldSku: r.oldSku,
      newSku: r.newSku,
      productName: r.productName,
      updatedBy: String(r.updatedBy),
      updatedByName: r.updatedByName,
      createdAt: r.createdAt,
    })),
  });
});

export const createShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  if (process.env.NODE_ENV === "production") {
    throw new AppError(
      503,
      "Legacy test shipment creation is disabled in production. Use Velocity forward shipment (/api/velocity/forward/create)."
    );
  }
  const { orderId, courierId, warehouseId } = req.body as {
    orderId?: string;
    courierId?: string;
    warehouseId?: string;
  };
  if (!orderId || !courierId || !warehouseId) {
    throw new AppError(400, "orderId, courierId and warehouseId are required");
  }

  const order = await Order.findOne({ orderId });
  if (!order) throw new AppError(404, "Order not found");
  if (order.shipmentCreated) throw new AppError(400, "Shipment already created for this order");
  if (order.isJunk) throw new AppError(400, "Cannot create shipment for junk order");

  const courier = await Courier.findById(courierId).lean();
  if (!courier) throw new AppError(404, "Courier not found");
  const warehouse = await Warehouse.findById(warehouseId).lean();
  if (!warehouse) throw new AppError(404, "Warehouse not found");
  if (warehouse.isActive === false) throw new AppError(400, "Warehouse is inactive");

  const shipmentId = `SHP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const trackingId = `TRK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  order.shipmentCreated = true;
  order.shipmentId = shipmentId;
  order.trackingId = trackingId;
  order.courier = courier.name;
  order.status = "shipped";
  order.isJunk = false;
  order.pickupAddress = warehouse.name || order.pickupAddress;
  await order.save();

  const owner = orderWalletUserId(order);
  if (owner) {
    await createInAppNotification(
      owner,
      "shipment_created",
      `Shipment created for ${order.orderId}`,
      `Tracking: ${trackingId}. Courier: ${courier.name}.`,
      { orderId: order.orderId, trackingId, shipmentId }
    );
  }

  res.json({
    success: true,
    trackingId,
    shipmentId,
  });
});

/** Statuses that must not be manually pushed to Ready to Ship (already shipped / in pipeline / terminal). */
const BLOCKED_BULK_MOVE_TO_READY = new Set([
  "shipped",
  "in-transit",
  "in_transit",
  "out-for-delivery",
  "out_for_delivery",
  "delivered",
  "pending-pickup",
  "pending_pickup",
  "pickup_scheduled",
  "picked_up",
  "ready-to-ship",
  "ready_to_ship",
  "failed",
  "reship",
  "junk",
  "cancelled",
  "rto",
  "ndr",
]);

export const bulkMoveOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role === "dropshipper") {
    const access = await getDropshipperAccessType(req.user._id);
    if (access === "RESTRICTED") throw new AppError(403, "Restricted account cannot process orders");
  }
  const body = req.body as { orderIds?: unknown; targetStatus?: unknown };
  const orderIds = body.orderIds;
  const targetStatus = body.targetStatus;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new AppError(400, "orderIds must be a non-empty array");
  }
  if (targetStatus !== "ready_to_ship") {
    throw new AppError(400, "targetStatus must be ready_to_ship");
  }

  const ids = [...new Set(orderIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) throw new AppError(400, "orderIds must not be empty");

  const orders = await Order.find({ orderId: { $in: ids } }).exec();
  if (orders.length !== ids.length) {
    throw new AppError(404, "One or more orders were not found");
  }

  for (const order of orders) {
    await assertOrderAccess(req.user, order);

    if (order.isJunk) {
      throw new AppError(400, "Cannot move junk orders to Ready to Ship");
    }
    const st = String(order.status || "").toLowerCase().replace(/-/g, "_");
    if (st === "delivered" || st === "cancelled") {
      throw new AppError(400, `Cannot move ${order.status} orders to Ready to Ship`);
    }
  }

  const prevStatusByOrderId = new Map(orders.map((o) => [o.orderId, String(o.status ?? "")]));

  const now = new Date();
  let updatedCount = 0;
  for (const order of orders) {
    order.status = "ready_to_ship";
    order.shipmentStatus = "ready_to_ship";
    order.movedToReadyAt = now;
    appendStatusHistory(order, "ready_to_ship", req.user._id, "Bulk moved to Ready to Ship");
    await order.save();
    updatedCount++;
  }

  const refreshed = await Order.find({ orderId: { $in: ids } }).lean();
  const { sendOrderTrackingEmail } = await import("../services/email/emailService.js");
  for (const row of refreshed) {
    void sendOrderTrackingEmail({
      order: row as never,
      previousStatusRaw: prevStatusByOrderId.get(row.orderId) ?? "",
    });
  }

  res.json({
    success: true,
    updatedCount,
  });
});

export function assertOrderEligibleForJunk(order: Pick<IOrder, "isJunk" | "status" | "awb">): void {
  if (order.isJunk) throw new AppError(400, "Order is already in Junk");
  if (String(order.awb ?? "").trim()) {
    throw new AppError(
      400,
      "Orders with an AWB cannot be moved to Junk. Use Cancel to move to Reship instead."
    );
  }
}

export const markOrderJunk = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id } = req.params;
  const { junkReason } = req.body as { junkReason?: string };
  const order = await Order.findOne({ orderId: id });
  if (!order) throw new AppError(404, "Order not found");
  await assertOrderAccess(req.user, order);
  assertOrderEligibleForJunk(order);
  order.isJunk = true;
  order.junkedAt = new Date();
  order.junkReason = junkReason?.trim() || order.junkReason;
  order.status = "junk";
  appendStatusHistory(order, "junk", req.user._id, junkReason?.trim());
  await order.save();

  res.json({
    success: true,
    message: "Order moved to junk",
  });
});

/** Admin: permanently delete a junk order from the system. */
export const deleteJunkOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const { id } = req.params;
  const order = await Order.findOne({ orderId: id });
  if (!order) throw new AppError(404, "Order not found");
  if (!order.isJunk) throw new AppError(400, "Only junk orders can be permanently deleted");

  await OrderSkuAudit.deleteMany({ orderId: order.orderId });
  await order.deleteOne();

  res.json({ success: true, message: "Order permanently deleted", orderId: id });
});

/** Admin: permanently delete multiple junk orders. */
export const bulkDeleteJunkOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const body = req.body as { orderIds?: unknown };
  if (!Array.isArray(body.orderIds) || body.orderIds.length === 0) {
    throw new AppError(400, "orderIds must be a non-empty array");
  }
  const ids = [...new Set(body.orderIds.map((x) => String(x).trim()).filter(Boolean))];

  const orders = await Order.find({ orderId: { $in: ids }, isJunk: true }).select("orderId").lean();
  if (orders.length === 0) throw new AppError(404, "No junk orders found to delete");

  const orderIds = orders.map((o) => o.orderId);
  await OrderSkuAudit.deleteMany({ orderId: { $in: orderIds } });
  const result = await Order.deleteMany({ orderId: { $in: orderIds }, isJunk: true });

  res.json({
    success: true,
    deletedCount: result.deletedCount ?? orderIds.length,
    orderIds,
  });
});

export const markOrderReship = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id } = req.params;
  const order = await Order.findOne({ orderId: id });
  if (!order) throw new AppError(404, "Order not found");
  await assertOrderAccess(req.user, order);

  // Cancel on the order's courier provider (Velocity or Lorrigo). Soft-fail so local reship still proceeds.
  const { cancelProviderShipmentForOrder } = await import("../modules/courier/cancelProviderShipment.js");
  const cancelResult = await cancelProviderShipmentForOrder(order, { reason: "customer_request" });
  if (cancelResult.attempted && !cancelResult.success) {
    devLog.warn(
      `[orders:reship] ${cancelResult.provider} cancel failed for ${order.orderId}: ${cancelResult.message ?? "unknown"}`
    );
  }

  order.isJunk = false;
  order.junkedAt = undefined;
  order.junkReason = undefined;
  clearOrderShipmentForRebook(order);
  order.status = "reship";
  order.shipmentStatus = "reship";
  appendStatusHistory(
    order,
    "reship",
    req.user._id,
    cancelResult.attempted
      ? `Moved to reship after ${cancelResult.provider} cancel${cancelResult.success ? "" : " (provider cancel failed)"}`
      : "Moved to reship"
  );
  await order.save();

  res.json({
    success: true,
    message: "Order moved to reship",
    providerCancel: cancelResult,
  });
});

export const updateOrderStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { orderId } = req.params;
  const { status } = req.body as { status?: string };
  if (!status) throw new AppError(400, "status required");
  const o = await Order.findOne({ orderId });
  if (!o) throw new AppError(404, "Order not found");
  await assertOrderAccess(req.user, o);

  if (req.user.role === "dropshipper") {
    const next = String(status).toLowerCase().replace(/-/g, "_");
    if (next !== "ready_to_ship") {
      throw new AppError(403, "Forbidden");
    }
    const st = String(o.status || "").toLowerCase().replace(/-/g, "_");
    if (st === "delivered" || st === "cancelled") {
      throw new AppError(400, `Cannot move ${o.status} orders to Ready to Ship`);
    }
    if (o.isJunk) throw new AppError(400, "Cannot move junk orders to Ready to Ship");

    o.status = "ready_to_ship";
    o.shipmentStatus = "ready_to_ship";
    o.movedToReadyAt = new Date();
    appendStatusHistory(o, "ready_to_ship", req.user._id);
  } else {
    const nextNorm = normalizeOrderStatus(status);
    const check = isValidStatusTransition(o.status, nextNorm, {
      role: req.user.role,
      isAdmin: req.user.role === "admin",
    });
    if (!check.ok) throw new AppError(400, check.message ?? "Invalid status transition");
    appendStatusHistory(o, nextNorm, req.user._id);
    o.status = nextNorm;
    // Keep shipmentStatus in sync so order tabs (Pending Pickup → In Transit, etc.) move correctly.
    if (nextNorm === "cancelled") {
      o.shipmentStatus = "cancelled";
    } else if (nextNorm !== "draft") {
      o.shipmentStatus = nextNorm;
    }
    if (nextNorm === "ready_to_ship") {
      o.shipmentStatus = "ready_to_ship";
      o.movedToReadyAt = new Date();
    }
  }
  await o.save();
  const activityAction =
    normalizeOrderStatus(o.status) === "cancelled"
      ? ACTIVITY_ACTIONS.ORDER_CANCELLED
      : ACTIVITY_ACTIONS.ORDER_UPDATED;
  recordUserActivity({
    user: req.user,
    module: "order",
    action: activityAction,
    req,
    metadata: { orderId: o.orderId, status: o.status },
  });
  res.json(mapOrder(o));
});


function isVelocityConfigured(): boolean {
  return Boolean(velocityConfig.username?.trim() && velocityConfig.password?.trim());
}

function normalizeOrderStatusKey(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

/** Orders that cannot enter Process Selected (already shipped, terminal, or already queued). */
const BLOCKED_PROCESS_SELECTED_STATUSES = new Set([
  "delivered",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "picked_up",
  "pending_pickup",
  "pickup_scheduled",
  "ndr",
  "rto",
  "junk",
  "failed",
]);

function clearOrderShipmentForRebook(order: InstanceType<typeof Order>): void {
  order.shipmentCreated = false;
  order.awb = "";
  order.trackingId = undefined;
  order.shipmentId = undefined;
  order.velocityOrderId = undefined;
  order.velocityShipmentId = undefined;
  order.velocityReturnId = undefined;
  order.lorrigoOrderId = undefined;
  order.lorrigoShipmentId = undefined;
  order.labelUrl = undefined;
  order.manifestUrl = undefined;
  order.courierCompanyId = undefined;
  order.shippingCharges = undefined;
  order.velocityFreightCost = undefined;
  order.codCharges = undefined;
  order.rtoCharges = undefined;
  order.trackingUrl = undefined;
  order.trackingActivities = undefined;
  order.bookingInProgress = false;
}

function restoreOrderFromJunkForProcess(order: InstanceType<typeof Order>): void {
  order.isJunk = false;
  order.junkedAt = undefined;
  order.junkReason = undefined;
  clearOrderShipmentForRebook(order);
  order.status = "ready_to_ship";
  order.shipmentStatus = "ready_to_ship";
}

function assertOrderEligibleForProcessSelected(o: IOrder): void {
  if (o.isJunk) throw new AppError(400, `Order ${o.orderId} is junk`);
  if (o.shipmentCreated) throw new AppError(400, `Order ${o.orderId} already has a shipment`);
  if (String(o.awb || "").trim()) {
    throw new AppError(400, `Order ${o.orderId} already has an AWB`);
  }
  const st = normalizeOrderStatusKey(o.status);
  if (BLOCKED_PROCESS_SELECTED_STATUSES.has(st)) {
    throw new AppError(400, `Order ${o.orderId} cannot be processed from status "${o.status}"`);
  }
}

type CourierSelectionMode = "priority" | "courier";

type ProcessSelectedPrep = {
  pickupAddressId: string;
  courierSelectionMode: CourierSelectionMode;
  courierName: string;
  carrierId: string | undefined;
  /** Provider for explicit courier booking; priority mode resolves per priority entry. */
  courierProvider: CourierProviderId;
  shipmentMode: string;
  weight: number | undefined;
  length: number | undefined;
  width: number | undefined;
  height: number | undefined;
  pickupSnapshot: ReturnType<typeof buildPickupSnapshotFromLean>["snapshot"];
  velocityWarehouseId: string;
  lorrigoPickupId: string;
  vendorIdFromPickup: Types.ObjectId | undefined;
  now: Date;
  /** Loaded once per bulk request (priority mode). */
  priorities: BulkCourierPriorityCandidate[];
  /** Dedupes Velocity serviceability calls for identical lanes. */
  serviceabilityCache: ServiceabilityCache;
  /** Dedupes multi-provider discovery for priority mode. */
  multiProviderServiceabilityCache: Map<string, Promise<PriorityServiceableCourier[]>>;
};

type OrderDoc = InstanceType<typeof Order>;

function applyProcessSelectedPrep(o: OrderDoc, prep: ProcessSelectedPrep, userId: Types.ObjectId): void {
  const st = normalizeOrderStatusKey(o.status);
  const isReship = st === "reship";
  if (isReship) {
    o.status = "ready_to_ship";
    o.shipmentStatus = "ready_to_ship";
    clearOrderShipmentForRebook(o);
  } else if (st !== "ready_to_ship") {
    o.status = "ready_to_ship";
    o.shipmentStatus = "ready_to_ship";
  }
  if (st !== "ready_to_ship") {
    o.movedToReadyAt = prep.now;
    appendStatusHistory(
      o,
      "ready_to_ship",
      userId,
      isReship ? "Reship — moved via Process Selected" : "Auto-moved via Process Selected"
    );
  }

  o.courierName = prep.courierSelectionMode === "priority" ? "Priority" : prep.courierName;
  o.courier = prep.courierSelectionMode === "priority" ? "Priority" : prep.courierName;
  if (prep.courierSelectionMode === "priority") {
    o.courierCompanyId = undefined;
  } else if (prep.carrierId?.trim()) {
    o.courierCompanyId = prep.carrierId.trim();
  }
  o.pickupAddressId = new mongoose.Types.ObjectId(prep.pickupAddressId);
  o.pickupWarehouseId = prep.pickupAddressId;
  o.pickupAddress = prep.pickupSnapshot;
  o.velocityWarehouseId = prep.velocityWarehouseId;
  if (prep.vendorIdFromPickup) {
    o.vendorId = prep.vendorIdFromPickup;
  }
  if (prep.weight !== undefined) o.weight = String(prep.weight);
  if (prep.length !== undefined) o.length = prep.length;
  if (prep.width !== undefined) {
    o.width = prep.width;
    o.breadth = prep.width;
  }
  if (prep.height !== undefined) o.height = prep.height;
  if (o.length && (o.width ?? o.breadth) && o.height) {
    const w = o.width ?? o.breadth;
    o.dimensions = `${o.length}x${w}x${o.height} cm`;
  }
  (o as unknown as { shipmentMode?: string }).shipmentMode = prep.shipmentMode;
}

function isMongooseVersionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = String((err as { name?: string }).name ?? "");
  const msg = String((err as { message?: string }).message ?? "");
  return name === "VersionError" || /No matching document found for id/i.test(msg);
}

/**
 * Persist Process Selected prep fields before provider booking.
 * Retries once on optimistic-concurrency conflicts (Shopify sync / claim races).
 */
async function persistProcessSelectedPrep(
  o: OrderDoc,
  prep: ProcessSelectedPrep,
  userId: Types.ObjectId
): Promise<OrderDoc> {
  applyProcessSelectedPrep(o, prep, userId);
  try {
    await o.save();
    return o;
  } catch (err) {
    if (!isMongooseVersionError(err)) throw err;
    const fresh = await Order.findById(o._id);
    if (!fresh) throw err;
    applyProcessSelectedPrep(fresh, prep, userId);
    await fresh.save();
    return fresh;
  }
}

/** Save after booking when the in-memory doc may be stale vs claim/provider writes. */
async function saveOrderAfterBooking(o: OrderDoc): Promise<void> {
  try {
    await o.save();
  } catch (err) {
    if (!isMongooseVersionError(err)) throw err;
    const fresh = await Order.findById(o._id);
    if (!fresh) throw err;
    // Booking helpers already persisted AWB + courier status. Only merge history —
    // never force status/shipmentStatus back to pending_pickup (that trapped orders
    // on the Pending Pickup tab after the courier had already moved on).
    const incomingHistory = Array.isArray(o.statusHistory) ? o.statusHistory : [];
    const existingHistory = Array.isArray(fresh.statusHistory) ? fresh.statusHistory : [];
    if (incomingHistory.length > existingHistory.length) {
      fresh.statusHistory = incomingHistory.slice(-50);
      fresh.markModified("statusHistory");
      await fresh.save();
    }
  }
}

function noteProcessSelectedBooked(o: OrderDoc, userId: Types.ObjectId, provider?: "velocity" | "lorrigo") {
  const canonical = normalizeOrderStatus(o.status);
  const via =
    provider === "lorrigo"
      ? "Processed via Process Selected (Lorrigo priority)"
      : "Processed via Process Selected (priority)";
  appendStatusHistory(o, canonical === "draft" ? "pickup_scheduled" : canonical, userId, via);
}

async function listMultiProviderServiceableForOrder(
  o: OrderDoc,
  prep: ProcessSelectedPrep
): Promise<PriorityServiceableCourier[]> {
  const fromPin = normalizePincode(
    prep.pickupSnapshot && typeof prep.pickupSnapshot === "object"
      ? String((prep.pickupSnapshot as { pincode?: string }).pincode ?? "")
      : ""
  );
  const toPin = normalizePincode(String(o.shippingPincode ?? o.pincode ?? ""));
  if (fromPin.length !== 6 || toPin.length !== 6) return [];

  const paymentMode = String(o.payment ?? "").toLowerCase().includes("cod") ? "cod" : "prepaid";
  const weightKg = Number(prep.weight ?? o.weight ?? 0.5) || 0.5;
  const lengthCm = Number(prep.length ?? o.length ?? 10) || 10;
  const widthCm = Number(prep.width ?? o.width ?? o.breadth ?? 10) || 10;
  const heightCm = Number(prep.height ?? o.height ?? 10) || 10;
  const key = `${fromPin}|${toPin}|${paymentMode}|${weightKg}|${lengthCm}|${widthCm}|${heightCm}`;

  if (prep.multiProviderServiceabilityCache.has(key)) {
    return prep.multiProviderServiceabilityCache.get(key)!;
  }

  const pending = (async (): Promise<PriorityServiceableCourier[]> => {
    try {
      const result = await discoverServiceability(
        {
          fromPincode: fromPin,
          toPincode: toPin,
          paymentMode,
          weightKg,
          lengthCm,
          widthCm,
          heightCm,
          codValue: paymentMode === "cod" ? Number(o.amount ?? 0) : undefined,
          shipmentType: "forward",
        },
        { mode: "both" }
      );
      return (result.couriers ?? [])
        .filter((c) => c.serviceable !== false)
        .map((c) => ({
          carrier_id: String(c.courierId ?? "").trim(),
          carrier_name: String(c.courierName ?? "").trim(),
          provider: c.provider === "lorrigo" ? ("lorrigo" as const) : ("velocity" as const),
        }))
        .filter((c) => c.carrier_id && c.carrier_name);
    } catch {
      return [];
    }
  })();

  prep.multiProviderServiceabilityCache.set(key, pending);
  return pending;
}

async function bookPriorityResolvedCourier(
  req: AuthRequest,
  o: OrderDoc,
  prep: ProcessSelectedPrep,
  preferred: ResolvedServiceableCarrier,
  bookingBase: Record<string, unknown>
): Promise<{ awb: string; carrier: string }> {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const provider = preferred.provider === "lorrigo" ? "lorrigo" : "velocity";

  if (provider === "lorrigo") {
    if (!prep.lorrigoPickupId) {
      throw new AppError(
        422,
        "Pickup address must be synced to Lorrigo before booking a Lorrigo courier from Priority Selection."
      );
    }
    const w = Number(prep.weight ?? o.weight);
    const L = Number(prep.length ?? o.length ?? 10);
    const W = Number(prep.width ?? o.width ?? o.breadth ?? 10);
    const H = Number(prep.height ?? o.height ?? 10);
    const booking = await bookLorrigoShipment({
      order: o,
      provider: "lorrigo",
      pickupAddressId: prep.pickupAddressId,
      courierId: preferred.carrier_id,
      courierName: preferred.carrier_name,
      weightKg: w,
      lengthCm: L,
      widthCm: W,
      heightCm: H,
      skipServiceability: true,
      userId: req.user._id,
    });
    return { awb: booking.awb, carrier: booking.courierName || preferred.carrier_name };
  }

  if (!prep.velocityWarehouseId) {
    throw new AppError(
      422,
      "Pickup address must be linked to Velocity before booking a Velocity courier from Priority Selection."
    );
  }
  const booking = await bookForwardShipmentForOrder(req, o, {
    ...bookingBase,
    courier_name: preferred.carrier_name,
    carrier_id: preferred.carrier_id,
    skip_serviceability: true,
  });
  noteProcessSelectedBooked(o, req.user._id, "velocity");
  await saveOrderAfterBooking(o);
  return { awb: booking.awb_code, carrier: booking.carrier_name };
}

type ProcessSelectedOrderResult =
  | { outcome: "updated"; orderId: string; awb: string; carrier: string }
  | { outcome: "skipped"; orderId: string; reason: string }
  | { outcome: "failed"; orderId: string; error: string };

async function processOneSelectedOrder(
  req: AuthRequest,
  o: OrderDoc,
  prep: ProcessSelectedPrep
): Promise<ProcessSelectedOrderResult> {
  if (!req.user) throw new AppError(401, "Unauthorized");

  if (o.shipmentCreated || String(o.awb || "").trim()) {
    return {
      outcome: "skipped",
      orderId: o.orderId,
      reason: "Order already has a shipment",
    };
  }

  if (o.isJunk) {
    restoreOrderFromJunkForProcess(o);
    appendStatusHistory(o, "ready_to_ship", req.user._id, "Restored from junk via Process Selected");
  }

  try {
    assertOrderEligibleForProcessSelected(o);
  } catch (err: unknown) {
    return {
      outcome: "skipped",
      orderId: o.orderId,
      reason: err instanceof AppError ? err.message : "Order is not eligible",
    };
  }

  // Persist prep before booking — Lorrigo claim bumps __v and would otherwise break a later o.save().
  try {
    o = await persistProcessSelectedPrep(o, prep, req.user._id);
  } catch (err: unknown) {
    return {
      outcome: "failed",
      orderId: o.orderId,
      error: formatErrorMessage(err, "Failed to prepare order for booking"),
    };
  }

  const bookingBase: Record<string, unknown> = {
    orderId: o.orderId,
    warehouseId: prep.pickupAddressId,
    weight: prep.weight,
    length: prep.length,
    width: prep.width,
    height: prep.height,
  };

  if (prep.courierSelectionMode === "priority") {
    const priorities = prep.priorities;
    if (priorities.length === 0) {
      return {
        outcome: "failed",
        orderId: o.orderId,
        error: "No courier priority list configured. Open Priority Selection to set one.",
      };
    }

    const attemptErrors: string[] = [];
    let bookedPreferredKey: string | undefined;
    let preferred: ResolvedServiceableCarrier | undefined;

    // Multi-provider discovery so Lorrigo priority #1 (e.g. Delhivery Spcl) is not
    // fuzzy-matched onto a Velocity Delhivery service.
    const serviceable = await listMultiProviderServiceableForOrder(o, prep);
    preferred = pickPriorityServiceableCourier(priorities, serviceable);
    if (preferred) {
      bookedPreferredKey = `${preferred.provider ?? "velocity"}::${preferred.carrier_id}`;
      try {
        const booking = await bookPriorityResolvedCourier(req, o, prep, preferred, bookingBase);
        return {
          outcome: "updated",
          orderId: o.orderId,
          awb: booking.awb,
          carrier: booking.carrier,
        };
      } catch (err: unknown) {
        if (o.shipmentCreated || String(o.awb || "").trim()) {
          return {
            outcome: "updated",
            orderId: o.orderId,
            awb: String(o.awb || ""),
            carrier: String(o.courierName || o.courier || preferred.carrier_name),
          };
        }
        attemptErrors.push(
          `${preferred.carrier_name} (${preferred.provider ?? "velocity"}): ${formatErrorMessage(err, "booking failed")}`
        );
      }
    }

    // Fallback: try remaining priorities in order (provider-aware).
    for (const candidate of priorities) {
      if (o.shipmentCreated || String(o.awb || "").trim()) {
        return {
          outcome: "updated",
          orderId: o.orderId,
          awb: String(o.awb || ""),
          carrier: String(o.courierName || o.courier || candidate.courierName),
        };
      }

      const candidateKey = `${candidate.provider ?? "velocity"}::${candidate.carrierId ?? candidate.courierName}`;
      if (
        bookedPreferredKey &&
        (candidateKey === bookedPreferredKey ||
          (candidate.carrierId?.trim() === preferred?.carrier_id &&
            (candidate.provider ?? preferred?.provider ?? "velocity") ===
              (preferred?.provider ?? "velocity")))
      ) {
        continue;
      }

      const resolved: ResolvedServiceableCarrier = {
        carrier_id: String(candidate.carrierId ?? "").trim(),
        carrier_name: candidate.courierName,
        provider: candidate.provider === "lorrigo" ? "lorrigo" : "velocity",
      };
      if (!resolved.carrier_id) {
        // Resolve from live serviceability by name within provider.
        const match = pickPriorityServiceableCourier([candidate], serviceable);
        if (!match) {
          attemptErrors.push(`${candidate.courierName}: not serviceable for this lane`);
          continue;
        }
        resolved.carrier_id = match.carrier_id;
        resolved.carrier_name = match.carrier_name;
        resolved.provider = match.provider;
      }

      try {
        const booking = await bookPriorityResolvedCourier(req, o, prep, resolved, bookingBase);
        return {
          outcome: "updated",
          orderId: o.orderId,
          awb: booking.awb,
          carrier: booking.carrier,
        };
      } catch (err: unknown) {
        if (o.shipmentCreated || String(o.awb || "").trim()) {
          return {
            outcome: "updated",
            orderId: o.orderId,
            awb: String(o.awb || ""),
            carrier: String(o.courierName || o.courier || candidate.courierName),
          };
        }
        attemptErrors.push(
          `${candidate.courierName}: ${formatErrorMessage(err, "not serviceable or booking failed")}`
        );
      }
    }

    return {
      outcome: "failed",
      orderId: o.orderId,
      error:
        attemptErrors.length > 0
          ? attemptErrors.join(" → ")
          : "No courier in your priority list can deliver to this pincode.",
    };
  }

  const bookingBody: Record<string, unknown> = { ...bookingBase };
  bookingBody.courier_name = prep.courierName;
  if (prep.carrierId?.trim()) {
    bookingBody.carrier_id = prep.carrierId.trim();
    bookingBody.skip_serviceability = true;
  }

  // Lorrigo explicit courier booking — Velocity path below is untouched.
  if (prep.courierProvider === "lorrigo") {
    try {
      const w = Number(prep.weight ?? o.weight);
      const L = Number(prep.length ?? o.length ?? 10);
      const W = Number(prep.width ?? o.width ?? o.breadth ?? 10);
      const H = Number(prep.height ?? o.height ?? 10);
      const booking = await bookLorrigoShipment({
        order: o,
        provider: "lorrigo",
        pickupAddressId: prep.pickupAddressId,
        courierId: String(prep.carrierId ?? "").trim(),
        courierName: prep.courierName,
        weightKg: w,
        lengthCm: L,
        widthCm: W,
        heightCm: H,
        skipServiceability: true,
        userId: req.user._id,
      });
      // bookLorrigoShipment already claims, sets pending_pickup, and saves — do not o.save() again.
      return {
        outcome: "updated",
        orderId: o.orderId,
        awb: booking.awb,
        carrier: booking.courierName || prep.courierName,
      };
    } catch (err: unknown) {
      return {
        outcome: "failed",
        orderId: o.orderId,
        error: formatErrorMessage(err, "Lorrigo booking failed"),
      };
    }
  }

  try {
    const booking = await bookForwardShipmentForOrder(req, o, bookingBody);
    noteProcessSelectedBooked(o, req.user._id);
    await saveOrderAfterBooking(o);
    return {
      outcome: "updated",
      orderId: o.orderId,
      awb: booking.awb_code,
      carrier: booking.carrier_name,
    };
  } catch (err: unknown) {
    return {
      outcome: "failed",
      orderId: o.orderId,
      error: formatErrorMessage(err, "Velocity booking failed"),
    };
  }
}

/**
 * Admin-only: Assign shipment processing details and move orders directly to Pending Pickup.
 * Orders do not need to be in Ready to Ship first — early statuses (e.g. pending/draft) are accepted.
 */
export const processSelectedOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const body = req.body as {
    orderIds?: unknown;
    pickupAddressId?: unknown;
    courierName?: unknown;
    carrierId?: unknown;
    courierSelectionMode?: unknown;
    /** velocity | lorrigo — optional; defaults to velocity */
    provider?: unknown;
    courierProvider?: unknown;
    shipmentMode?: unknown;
    weight?: unknown;
    length?: unknown;
    width?: unknown;
    height?: unknown;
  };

  const orderIds = body.orderIds;
  if (!Array.isArray(orderIds) || orderIds.length === 0) throw new AppError(400, "orderIds must be a non-empty array");
  const ids = [...new Set(orderIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) throw new AppError(400, "orderIds must not be empty");
  if (ids.length > PROCESS_SELECTED_MAX_ORDERS) {
    throw new AppError(400, `Maximum ${PROCESS_SELECTED_MAX_ORDERS} orders per bulk process request`);
  }

  const pickupAddressId = String(body.pickupAddressId ?? "").trim();
  if (!pickupAddressId) throw new AppError(400, "pickupAddressId is required");
  if (!mongoose.isValidObjectId(pickupAddressId)) throw new AppError(400, "Invalid pickupAddressId");

  const courierName = String(body.courierName ?? "").trim();
  const carrierId = body.carrierId != null ? String(body.carrierId).trim() : undefined;
  const modeRaw = String(body.courierSelectionMode ?? "").trim().toLowerCase();
  let courierSelectionMode: CourierSelectionMode;
  if (modeRaw === "courier" || modeRaw === "priority") {
    courierSelectionMode = modeRaw;
  } else if (!courierName || courierName.toLowerCase() === "auto") {
    courierSelectionMode = "priority";
  } else {
    courierSelectionMode = "courier";
  }

  if (courierSelectionMode === "courier") {
    if (!courierName) throw new AppError(400, "courierName is required for courier selection mode");
    if (!carrierId?.trim()) {
      throw new AppError(400, "carrierId is required when selecting a specific courier");
    }
  }

  const shipmentMode = String(body.shipmentMode ?? "forward").toLowerCase();
  if (!["forward", "reverse"].includes(shipmentMode)) throw new AppError(400, "shipmentMode must be forward or reverse");
  if (shipmentMode === "reverse") {
    throw new AppError(400, "Reverse shipments must be created from the order shipment dialog.");
  }

  const providerRaw = String(body.provider ?? body.courierProvider ?? "velocity")
    .trim()
    .toLowerCase();
  const courierProvider: CourierProviderId = providerRaw === "lorrigo" ? "lorrigo" : "velocity";

  // Load priority list early — needed to know which pickup links are required.
  const prioritiesEarly =
    courierSelectionMode === "priority" ? await getBulkCourierPriority() : [];
  if (courierSelectionMode === "priority" && prioritiesEarly.length === 0) {
    throw new AppError(
      400,
      "No courier priority list configured. Open Priority Selection to set one."
    );
  }

  const priorityNeedsLorrigo =
    courierSelectionMode === "priority" &&
    (prioritiesEarly.some((p) => p.provider === "lorrigo") ||
      // Legacy entries without provider: allow Lorrigo exact-name match when enabled.
      (isLorrigoEnabledFlag() && prioritiesEarly.some((p) => !p.provider)));
  const priorityNeedsVelocity =
    courierSelectionMode === "priority" &&
    (prioritiesEarly.some((p) => p.provider === "velocity" || !p.provider) ||
      prioritiesEarly.length === 0);

  if (courierSelectionMode === "courier" && courierProvider === "lorrigo") {
    if (!isLorrigoEnabledFlag()) {
      throw new AppError(503, "Lorrigo is disabled (LORRIGO_ENABLED is not true).");
    }
    const lorrigo = getCourierProvider("lorrigo");
    if (!providerSupports(lorrigo.capabilities, "booking") || !lorrigo.isConfigured()) {
      throw new AppError(503, "Lorrigo booking is not available (provider not configured).");
    }
  } else if (courierSelectionMode === "courier") {
    if (!isVelocityEnabledFlag()) {
      throw new AppError(503, "Velocity is disabled (VELOCITY_ENABLED=false).");
    }
    if (!isVelocityConfigured()) {
      throw new AppError(
        503,
        "Velocity courier credentials are not configured. Set VELOCITY_USERNAME and VELOCITY_PASSWORD to book real AWBs."
      );
    }
  } else {
    // Priority mode may mix providers.
    if (priorityNeedsVelocity) {
      if (!isVelocityEnabledFlag()) {
        throw new AppError(503, "Velocity is disabled (VELOCITY_ENABLED=false).");
      }
      if (!isVelocityConfigured()) {
        throw new AppError(
          503,
          "Velocity courier credentials are not configured. Set VELOCITY_USERNAME and VELOCITY_PASSWORD to book real AWBs."
        );
      }
    }
    if (priorityNeedsLorrigo) {
      if (!isLorrigoEnabledFlag()) {
        throw new AppError(503, "Lorrigo is disabled (LORRIGO_ENABLED is not true).");
      }
      const lorrigo = getCourierProvider("lorrigo");
      if (!providerSupports(lorrigo.capabilities, "booking") || !lorrigo.isConfigured()) {
        throw new AppError(503, "Lorrigo booking is not available (provider not configured).");
      }
    }
  }

  const weight = body.weight != null && String(body.weight).trim() !== "" ? Number(body.weight) : undefined;
  if (weight !== undefined && (!(weight > 0) || !Number.isFinite(weight))) throw new AppError(400, "weight must be > 0");

  const length = body.length != null && String(body.length).trim() !== "" ? Number(body.length) : undefined;
  const width = body.width != null && String(body.width).trim() !== "" ? Number(body.width) : undefined;
  const height = body.height != null && String(body.height).trim() !== "" ? Number(body.height) : undefined;
  for (const [k, v] of [
    ["length", length],
    ["width", width],
    ["height", height],
  ] as const) {
    if (v !== undefined && (!(v > 0) || !Number.isFinite(v))) throw new AppError(400, `${k} must be > 0`);
  }

  const pickup = await Pickup.findOne(pickupByIdSelectableQuery(pickupAddressId, req.user))
    .select(
      "label contactName phone alternatePhone email addressLine1 addressLine2 landmark city state pincode country gstin velocityWarehouseId lorrigoPickupId lorrigoSyncStatus vendorId createdByRole userId"
    )
    .lean();
  if (!pickup) throw new AppError(404, "Pickup address not found");

  const lorrigoPickupId = String((pickup as { lorrigoPickupId?: string }).lorrigoPickupId ?? "").trim();
  let velocityWarehouseId = "";

  const needVelocityLink =
    (courierSelectionMode === "courier" && courierProvider === "velocity") || priorityNeedsVelocity;
  const needLorrigoLink =
    (courierSelectionMode === "courier" && courierProvider === "lorrigo") || priorityNeedsLorrigo;

  if (needVelocityLink) {
    const syncResult = await syncPickupToVelocity(pickupAddressId);
    if ("error" in syncResult && syncResult.error) {
      throw new AppError(422, `Pickup address is not linked to Velocity: ${syncResult.error}`);
    }
    velocityWarehouseId =
      ("warehouse_id" in syncResult && syncResult.warehouse_id?.trim()) ||
      String(pickup.velocityWarehouseId ?? "").trim();
    if (!velocityWarehouseId) {
      throw new AppError(
        422,
        "Pickup address must be linked to a Velocity warehouse before booking shipments. Sync the pickup in Admin settings."
      );
    }
  } else {
    velocityWarehouseId = String(pickup.velocityWarehouseId ?? "").trim();
  }

  if (needLorrigoLink && !lorrigoPickupId) {
    throw new AppError(
      422,
      "Pickup address must be synced to Lorrigo before booking. Use Sync to Lorrigo / Retry Sync on the pickup address."
    );
  }

  const vendorIdFromPickup = await resolveVendorIdFromPickup(pickup);

  const pickupSnapshot = buildPickupSnapshotFromLean(
    { ...pickup, velocityWarehouseId: velocityWarehouseId || pickup.velocityWarehouseId },
    new mongoose.Types.ObjectId(pickupAddressId)
  ).snapshot;

  const orders = await Order.find({ orderId: { $in: ids } }).exec();
  if (orders.length !== ids.length) throw new AppError(404, "One or more orders were not found");

  const orderById = new Map(orders.map((o) => [o.orderId, o]));
  const ordered = ids
    .map((id) => orderById.get(id))
    .filter((o): o is OrderDoc => o != null);

  const priorities = prioritiesEarly;

  const prep: ProcessSelectedPrep = {
    pickupAddressId,
    courierSelectionMode,
    courierName,
    carrierId,
    courierProvider,
    shipmentMode,
    weight,
    length,
    width,
    height,
    pickupSnapshot,
    velocityWarehouseId,
    lorrigoPickupId,
    vendorIdFromPickup: vendorIdFromPickup ?? undefined,
    now: new Date(),
    priorities,
    serviceabilityCache: new Map(),
    multiProviderServiceabilityCache: new Map(),
  };

  const results = await mapWithConcurrency(ordered, PROCESS_SELECTED_CONCURRENCY, (o) =>
    processOneSelectedOrder(req, o, prep)
  );

  const updated: { orderId: string; awb: string; carrier: string }[] = [];
  const failed: { orderId: string; error: string }[] = [];
  const skipped: { orderId: string; reason: string }[] = [];

  for (const r of results) {
    if (r.outcome === "updated") {
      updated.push({ orderId: r.orderId, awb: r.awb, carrier: r.carrier });
    } else if (r.outcome === "failed") {
      failed.push({ orderId: r.orderId, error: r.error });
    } else {
      skipped.push({ orderId: r.orderId, reason: r.reason });
    }
  }

  res.json({
    success: failed.length === 0,
    updatedCount: updated.length,
    updated,
    failed,
    skipped,
    total: ids.length,
  });
});

export const trackOrderByAwb = asyncHandler(async (req: Request, res: Response) => {
  const { awb } = req.params;
  const o = await Order.findOne({ awb }).lean();
  if (!o) throw new AppError(404, "Order not found");
  res.json(mapToPublicTracking(o));
});

/** Public tracking by business order id */
export const publicOrderByOrderId = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const o = await Order.findOne({ orderId }).lean();
  if (!o) throw new AppError(404, "Order not found");
  res.json(mapToPublicTracking(o));
});

export const getOrderById = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { orderId } = req.params;
  const o = await Order.findOne({ orderId });
  if (!o) throw new AppError(404, "Order not found");
  await assertOrderAccess(req.user, o);
  res.json(mapOrder(o));
});
