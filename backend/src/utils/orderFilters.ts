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
  AWAITING_COURIER_PICKUP_MATCH_VALUES,
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
        // Never show NDR/RTO/delivery pipeline stages under Pending Pickup.
        neitherStatusNorShipmentStatusIn([
          ...NDR_MATCH_VALUES,
          ...RTO_MATCH_VALUES,
          ...IN_TRANSIT_MATCH_VALUES,
          ...OUT_FOR_DELIVERY_MATCH_VALUES,
          ...DELIVERED_MATCH_VALUES,
        ]),
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
            // Still awaiting courier collection (OUT_FOR_PICKUP / exception).
            { shipmentStatus: { $in: AWAITING_COURIER_PICKUP_MATCH_VALUES } },
            // Generic pending labels only when status has not already advanced past pickup.
            {
              $and: [
                { shipmentStatus: { $in: PENDING_PICKUP_MATCH_VALUES } },
                { status: { $nin: AFTER_PENDING_PICKUP_MATCH_VALUES } },
              ],
            },
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
        // Exclude only active awaiting-pickup shipment stages (not stale pending_pickup labels).
        neitherStatusNorShipmentStatusIn(AWAITING_COURIER_PICKUP_MATCH_VALUES),
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

function parseCsvList(v: unknown, maxItems = 50, maxLen = 200): string[] {
  const raw = String(v ?? "").trim();
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[,|\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.length > maxLen ? s.slice(0, maxLen) : s))
    ),
  ].slice(0, maxItems);
}

function parseSearchField(v: unknown): OrderSearchField | undefined {
  const raw = clip(String(v ?? ""), 40).trim();
  if (!raw) return undefined;
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, OrderSearchField> = {
    trackingid: "trackingId",
    orderid: "orderId",
    invoicenumber: "invoiceNumber",
    channelordernumber: "channelOrderNumber",
    productname: "productName",
    productsku: "productSku",
    consigneename: "consigneeName",
    consigneemobile: "consigneeMobile",
    consigneeemail: "consigneeEmail",
  };
  return map[key];
}

/** Multi-value search input (newline or comma separated). */
export function parseSearchValues(raw: string): string[] {
  return parseCsvList(raw, 100, 200);
}

const LINE_ITEM_SKU_PATHS = [
  "products.sku",
  "orderItems.sku",
  "items.sku",
  "shopifyLineItems.sku",
] as const;

const LINE_ITEM_NAME_PATHS = [
  "products.name",
  "products.title",
  "orderItems.name",
  "orderItems.title",
  "items.name",
  "items.title",
  "shopifyLineItems.name",
  "shopifyLineItems.title",
] as const;

function exactFieldRegex(values: string[]): RegExp[] {
  return values.map((v) => new RegExp(`^${escapeRegex(v.trim())}$`, "i"));
}

function partialFieldRegex(values: string[]): RegExp[] {
  return values.map((v) => new RegExp(escapeRegex(v.trim()), "i"));
}

/** Field-targeted search (Image 2 style dropdown + value). */
export function buildFieldSearchQuery(
  field: OrderSearchField,
  rawValue: string
): Record<string, unknown> | undefined {
  const values = parseSearchValues(rawValue);
  if (values.length === 0) return undefined;

  const orClauses: Record<string, unknown>[] = [];
  const pushPartial = (paths: string[], rxList: RegExp[]) => {
    for (const path of paths) {
      for (const rx of rxList) orClauses.push({ [path]: rx });
    }
  };
  const pushExact = (paths: string[], rxList: RegExp[]) => {
    for (const path of paths) {
      for (const rx of rxList) orClauses.push({ [path]: rx });
    }
  };

  if (field === "trackingId") {
    for (const v of values) {
      orClauses.push(...scanLookupClauses(v));
      pushPartial(["trackingId", "awb", "trackingUrl"], partialFieldRegex([v]));
    }
  } else if (field === "orderId") {
    for (const v of values) {
      pushPartial(["orderId", "externalOrderName"], partialFieldRegex([v]));
      if (mongoose.Types.ObjectId.isValid(v) && v.length === 24) {
        try {
          orClauses.push({ _id: new mongoose.Types.ObjectId(v) });
        } catch {
          /* ignore */
        }
      }
    }
  } else if (field === "invoiceNumber") {
    pushPartial(["orderId", "externalOrderName", "shopifyOrderNumericId"], partialFieldRegex(values));
  } else if (field === "channelOrderNumber") {
    pushPartial(
      ["externalOrderName", "shopifyOrderNumericId", "externalOrderId"],
      partialFieldRegex(values)
    );
  } else if (field === "productName") {
    pushPartial([...LINE_ITEM_NAME_PATHS], partialFieldRegex(values));
  } else if (field === "productSku") {
    pushExact([...LINE_ITEM_SKU_PATHS], exactFieldRegex(values));
  } else if (field === "consigneeName") {
    pushPartial(["customer", "customerName", "consigneeName"], partialFieldRegex(values));
  } else if (field === "consigneeMobile") {
    pushPartial(["phone", "customerPhone"], partialFieldRegex(values));
  } else if (field === "consigneeEmail") {
    pushPartial(["customerEmail"], partialFieldRegex(values));
  }

  if (orClauses.length === 0) return undefined;
  return { $or: orClauses };
}

function buildStoreFilterQuery(stores: string[]): Record<string, unknown> {
  const or: Record<string, unknown>[] = [];
  for (const store of stores) {
    const label = store.trim();
    if (!label) continue;
    const rx = new RegExp(`^${escapeRegex(label)}$`, "i");
    const domainStem = label.replace(/\.myshopify\.com$/i, "");
    const domainRx = new RegExp(escapeRegex(domainStem), "i");
    or.push({ shopifyStoreName: rx });
    or.push({ shopifyShopDomain: domainRx });
  }
  if (or.length === 0) return {};
  return { $or: or };
}

function buildCouriersFilterQuery(names: string[]): Record<string, unknown> {
  const or: Record<string, unknown>[] = [];
  for (const name of names) {
    const rx = new RegExp(`^${escapeRegex(name.trim())}$`, "i");
    or.push({ courier: rx }, { courierName: rx });
  }
  return { $or: or };
}

function buildProductSkusFilterQuery(skus: string[]): Record<string, unknown> {
  const rxList = exactFieldRegex(skus);
  const or: Record<string, unknown>[] = [];
  for (const path of LINE_ITEM_SKU_PATHS) {
    for (const rx of rxList) or.push({ [path]: rx });
  }
  return { $or: or };
}

function buildProductNamesFilterQuery(
  names: string[],
  mode: "and" | "or" | "not"
): Record<string, unknown> | undefined {
  if (names.length === 0) return undefined;
  const clauses = names.map((name) => {
    const rx = new RegExp(`^${escapeRegex(name.trim())}$`, "i");
    return {
      $or: LINE_ITEM_NAME_PATHS.map((path) => ({ [path]: rx })),
    };
  });
  if (mode === "and") return { $and: clauses };
  if (mode === "not") {
    return { $nor: clauses };
  }
  return { $or: clauses };
}

function buildPickupKeysFilterQuery(keys: string[]): Record<string, unknown> {
  const or: Record<string, unknown>[] = [];
  for (const key of keys) {
    const k = key.trim();
    if (!k || k === "__unassigned__") {
      or.push(
        { pickupAddressId: { $exists: false } },
        { pickupAddressId: null },
        { pickupAddressId: "" },
        { pickupAddress: { $exists: false } },
        { pickupAddress: null },
        { pickupAddress: "" }
      );
      continue;
    }
    if (mongoose.Types.ObjectId.isValid(k) && k.length === 24) {
      try {
        or.push({ pickupAddressId: new mongoose.Types.ObjectId(k) });
      } catch {
        /* ignore */
      }
    }
    const rx = new RegExp(`^${escapeRegex(k)}$`, "i");
    or.push(
      { "pickupAddress.label": rx },
      { "pickupAddress.warehouseName": rx },
      { "pickupAddress.pickupName": rx }
    );
  }
  return { $or: or };
}

export type OrderSearchField =
  | "trackingId"
  | "orderId"
  | "invoiceNumber"
  | "channelOrderNumber"
  | "productName"
  | "productSku"
  | "consigneeName"
  | "consigneeMobile"
  | "consigneeEmail";

export type ParsedOrderListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  searchField?: OrderSearchField;
  searchValue?: string;
  status?: string;
  payment?: string;
  courier?: string;
  couriers?: string[];
  source?: string;
  fulfillment?: string;
  dateFrom?: Date;
  dateTo?: Date;
  tab?: string;
  counts: boolean;
  countsOnly: boolean;
  customerCity?: string;
  customerState?: string;
  customerName?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupStates?: string[];
  pickupCities?: string[];
  pickupKeys?: string[];
  pickupMissing?: "yes" | "no";
  pickupValidPincode?: "yes" | "no";
  pickupVelocityLinked?: "yes" | "no";
  pickupVelocityUnlinked?: "yes" | "no";
  productSku?: string;
  productSkus?: string[];
  productName?: string;
  productNames?: string[];
  productNameMode?: "and" | "or" | "not";
  store?: string[];
  remark?: string;
  remarkHas?: "yes" | "no";
  amountMin?: number;
  amountMax?: number;
  hasAwb?: "yes" | "no";
  shipmentCreated?: "yes" | "no";
  dropshipperId?: string;
  vendorId?: string;
  /** Which timestamp dateFrom/dateTo apply to: placed | pickup | delivered */
  dateType?: "placed" | "pickup" | "delivered";
};

export type OrderListFilterExcludeKey =
  | "store"
  | "couriers"
  | "productSkus"
  | "productNames"
  | "searchField"
  | "remark";

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
  const customerName = clip(String(q.customerName ?? ""), 120) || undefined;
  const pickupCity = clip(String(q.pickupCity ?? ""), 120) || undefined;
  const pickupState = clip(String(q.pickupState ?? ""), 120) || undefined;
  const pickupStates = parseCsvList(q.pickupStates);
  const pickupCities = parseCsvList(q.pickupCities);
  const pickupKeys = parseCsvList(q.pickupKeys);
  const pickupMissing = parseYesNo(q.pickupMissing);
  const pickupValidPincode = parseYesNo(q.pickupValidPincode);
  const pickupVelocityLinked = parseYesNo(q.pickupVelocityLinked);
  const pickupVelocityUnlinked = parseYesNo(q.pickupVelocityUnlinked);
  const productSku = clip(String(q.productSku ?? ""), 120) || undefined;
  const productSkus = parseCsvList(q.productSkus ?? q.productSkuList);
  const productName = clip(String(q.productName ?? ""), 200) || undefined;
  const productNames = parseCsvList(q.productNames ?? q.productNameList);
  const productNameModeRaw = clip(String(q.productNameMode ?? "or"), 8).toLowerCase();
  const productNameMode =
    productNameModeRaw === "and" || productNameModeRaw === "not" ? productNameModeRaw : "or";
  const store = parseCsvList(q.store);
  const couriers = parseCsvList(q.couriers ?? q.courierList);
  const remark = clip(String(q.remark ?? ""), 200) || undefined;
  const remarkHas = parseYesNo(q.remarkHas);
  const searchField = parseSearchField(q.searchField);
  const searchValue = clip(String(q.searchValue ?? ""), 2000) || undefined;

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
    searchField,
    searchValue,
    status,
    payment,
    courier,
    couriers: couriers.length > 0 ? couriers : undefined,
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
    customerName,
    pickupCity,
    pickupState,
    pickupStates: pickupStates.length > 0 ? pickupStates : undefined,
    pickupCities: pickupCities.length > 0 ? pickupCities : undefined,
    pickupKeys: pickupKeys.length > 0 ? pickupKeys : undefined,
    pickupMissing,
    pickupValidPincode,
    pickupVelocityLinked,
    pickupVelocityUnlinked,
    productSku,
    productSkus: productSkus.length > 0 ? productSkus : undefined,
    productName,
    productNames: productNames.length > 0 ? productNames : undefined,
    productNameMode: productNames.length > 0 ? productNameMode : undefined,
    store: store.length > 0 ? store : undefined,
    remark,
    remarkHas,
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
  pq: ParsedOrderListQuery,
  exclude: OrderListFilterExcludeKey[] = []
): Promise<Record<string, unknown> | undefined> {
  const skip = new Set(exclude);
  const parts: Record<string, unknown>[] = [];

  if (pq.search) parts.push(buildSearchQuery(pq.search));
  if (!skip.has("searchField") && pq.searchField && pq.searchValue) {
    const fieldQ = buildFieldSearchQuery(pq.searchField, pq.searchValue);
    if (fieldQ) parts.push(fieldQ);
  }
  if (pq.status) {
    const statusQ = buildStatusFilterQuery(pq.status);
    if (statusQ) parts.push(statusQ);
  }
  if (pq.payment) parts.push({ payment: pq.payment });
  if (!skip.has("couriers") && pq.couriers && pq.couriers.length > 0) {
    parts.push(buildCouriersFilterQuery(pq.couriers));
  } else if (pq.courier) {
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
  if (pq.customerName) {
    const rx = new RegExp(escapeRegex(pq.customerName), "i");
    parts.push({ $or: [{ customer: rx }, { customerName: rx }, { consigneeName: rx }] });
  }
  if (pq.pickupCity) {
    const rx = new RegExp(escapeRegex(pq.pickupCity), "i");
    parts.push({ "pickupAddress.city": rx });
  }
  if (pq.pickupState) {
    const rx = new RegExp(escapeRegex(pq.pickupState), "i");
    parts.push({ "pickupAddress.state": rx });
  }
  if (pq.pickupCities && pq.pickupCities.length > 0) {
    const or = pq.pickupCities.map((city) => ({
      "pickupAddress.city": new RegExp(`^${escapeRegex(city)}$`, "i"),
    }));
    parts.push({ $or: or });
  }
  if (pq.pickupStates && pq.pickupStates.length > 0) {
    const or = pq.pickupStates.map((state) => ({
      "pickupAddress.state": new RegExp(`^${escapeRegex(state)}$`, "i"),
    }));
    parts.push({ $or: or });
  }
  if (pq.pickupKeys && pq.pickupKeys.length > 0) {
    parts.push(buildPickupKeysFilterQuery(pq.pickupKeys));
  }
  if (pq.pickupMissing === "yes") {
    parts.push({
      $or: [
        { pickupAddressId: { $exists: false } },
        { pickupAddressId: null },
        { pickupAddressId: "" },
        { pickupAddress: { $exists: false } },
        { pickupAddress: null },
        { pickupAddress: "" },
      ],
    });
  } else if (pq.pickupMissing === "no") {
    parts.push({
      pickupAddressId: { $exists: true, $nin: [null, ""] },
    });
  }
  if (pq.pickupValidPincode === "yes") {
    parts.push({ "pickupAddress.pincode": { $regex: /^\d{6}$/ } });
  } else if (pq.pickupValidPincode === "no") {
    parts.push({
      $and: [
        { "pickupAddress.pincode": { $exists: true, $nin: [null, ""] } },
        { "pickupAddress.pincode": { $not: { $regex: /^\d{6}$/ } } },
      ],
    });
  }
  if (pq.pickupVelocityLinked === "yes") {
    parts.push({
      $or: [
        { "pickupAddress.velocityWarehouseId": { $regex: /\S/ } },
        { velocityWarehouseId: { $regex: /\S/ } },
      ],
    });
  }
  if (pq.pickupVelocityUnlinked === "yes") {
    parts.push({
      $and: [
        {
          $or: [
            { pickupAddressId: { $exists: true, $nin: [null, ""] } },
            { pickupAddress: { $type: "object" } },
          ],
        },
        {
          $and: [
            {
              $or: [
                { "pickupAddress.velocityWarehouseId": { $exists: false } },
                { "pickupAddress.velocityWarehouseId": null },
                { "pickupAddress.velocityWarehouseId": "" },
              ],
            },
            {
              $or: [
                { velocityWarehouseId: { $exists: false } },
                { velocityWarehouseId: null },
                { velocityWarehouseId: "" },
              ],
            },
          ],
        },
      ],
    });
  }
  if (!skip.has("productNames") && pq.productNames && pq.productNames.length > 0) {
    const nameQ = buildProductNamesFilterQuery(pq.productNames, pq.productNameMode ?? "or");
    if (nameQ) parts.push(nameQ);
  } else if (pq.productName) {
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
  if (!skip.has("productSkus") && pq.productSkus && pq.productSkus.length > 0) {
    parts.push(buildProductSkusFilterQuery(pq.productSkus));
  } else if (pq.productSku) {
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
  if (!skip.has("store") && pq.store && pq.store.length > 0) {
    parts.push(buildStoreFilterQuery(pq.store));
  }
  if (!skip.has("remark") && pq.remark) {
    parts.push({ adminRemark: new RegExp(escapeRegex(pq.remark), "i") });
  }
  if (!skip.has("remark") && pq.remarkHas === "yes") {
    parts.push({ adminRemark: { $regex: /\S/ } });
  } else if (!skip.has("remark") && pq.remarkHas === "no") {
    parts.push({
      $or: [{ adminRemark: { $exists: false } }, { adminRemark: null }, { adminRemark: "" }],
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
