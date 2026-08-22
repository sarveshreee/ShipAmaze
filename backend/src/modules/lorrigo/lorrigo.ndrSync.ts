/**
 * Lorrigo NDR sync — upserts into shared NDR collection; leaves Velocity sync untouched.
 */

import { createHash } from "crypto";
import { NDR } from "../../models/NDR.js";
import { Order, type IOrder } from "../../models/Order.js";
import { Vendor } from "../../models/Vendor.js";
import { appendProviderEvent } from "../courier/providerEvents.js";
import { ensureCorrelationId } from "../courier/correlation.js";
import type { ProviderNdrRecord } from "../courier/types.js";
import { fetchLorrigoNdr } from "./lorrigo.ndr.js";
import { recordNdrDuplicateSuppressed } from "./lorrigo.ndrMetrics.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag } from "./lorrigo.config.js";
import type { HydratedDocument } from "mongoose";

export type LorrigoNdrSyncResult = {
  fetched: number;
  upserted: number;
  ordersUpdated: number;
  closed: number;
  errors: number;
  duplicatesSuppressed: number;
  errorDetails?: string[];
};

function formatLastUpdate(d = new Date()): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function fingerprint(rec: ProviderNdrRecord): string {
  const raw = [rec.awb, rec.reason, rec.providerStatus ?? "", rec.customerRemarks ?? ""].join("|");
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

function metaStr(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

async function findLocalOrderForLorrigoNdr(
  awb: string,
  rec: ProviderNdrRecord
): Promise<HydratedDocument<IOrder> | null> {
  const lorrigoOrderId = metaStr(rec.metadata as Record<string, unknown> | undefined, "lorrigoOrderId");
  const or: Record<string, unknown>[] = [{ awb }, { trackingId: awb }];
  if (rec.orderId) or.push({ orderId: rec.orderId });
  if (lorrigoOrderId) or.push({ lorrigoOrderId });

  // Prefer Lorrigo-tagged orders, but fall back to any AWB match (older rows may lack provider).
  const preferred = await Order.findOne({ $or: or, courierProvider: "lorrigo" });
  if (preferred) return preferred;
  return Order.findOne({ $or: or });
}

async function resolveSellerFromOrder(order: HydratedDocument<IOrder> | null): Promise<string> {
  if (!order) return "";
  if (order.vendorId) {
    const vendor = await Vendor.findById(order.vendorId).select("name").lean();
    if (vendor?.name) return String(vendor.name);
  }
  const pickup = order.pickupAddress;
  if (pickup && typeof pickup === "object" && pickup.label) return String(pickup.label);
  return String(order.channel ?? order.shopifyStoreName ?? "").trim();
}

function orderAddressParts(order: HydratedDocument<IOrder> | null) {
  if (!order) {
    return { address: "", city: "", state: "", pincode: "", payment: "" };
  }
  return {
    address: String(order.shippingAddress1 || order.address || "").trim(),
    city: String(order.shippingCity || order.city || "").trim(),
    state: String(order.shippingState || order.state || "").trim(),
    pincode: String(order.shippingPincode || order.pincode || "").trim(),
    payment: String(order.payment || "").trim(),
  };
}

/**
 * Prefer provider values, then existing NDR, then local ShipAmaze order.
 */
function prefer(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export async function upsertNdrFromLorrigoRecord(
  rec: ProviderNdrRecord
): Promise<{ upserted: boolean; duplicate: boolean; orderUpdated: boolean }> {
  const awb = rec.awb.trim();
  if (!awb) return { upserted: false, duplicate: false, orderUpdated: false };

  const fp = fingerprint(rec);
  const existing = await NDR.findOne({ awb });
  const order = await findLocalOrderForLorrigoNdr(awb, rec);
  const meta = (rec.metadata ?? {}) as Record<string, unknown>;
  const fromOrder = orderAddressParts(order);
  const seller = await resolveSellerFromOrder(order);

  const customer = prefer(rec.customerName, existing?.customer, order?.customer);
  const phone = prefer(rec.phone, existing?.phone, order?.phone, order?.customerPhone);
  const orderId = prefer(rec.orderId, existing?.orderId, order?.orderId);
  const address = prefer(metaStr(meta, "address"), existing?.address, fromOrder.address);
  const city = prefer(metaStr(meta, "city"), existing?.city, fromOrder.city);
  const state = prefer(metaStr(meta, "state"), existing?.state, fromOrder.state);
  const pincode = prefer(metaStr(meta, "pincode"), existing?.pincode, fromOrder.pincode);
  const payment = prefer(existing?.payment, fromOrder.payment);
  const amount =
    rec.amount ??
    existing?.amount ??
    (order && Number.isFinite(Number(order.amount)) ? Number(order.amount) : undefined);
  const carrier = prefer(rec.carrier, existing?.carrier, order?.courierName, order?.courier);
  const lorrigoOrderId = prefer(
    metaStr(meta, "lorrigoOrderId"),
    existing?.lorrigoOrderId,
    order?.lorrigoOrderId
  );

  // Same fingerprint + already Active: skip full rewrite unless we can fill missing details.
  const needsEnrichment =
    !customer ||
    !phone ||
    !orderId ||
    !address ||
    !(existing?.seller ?? "").trim() ||
    !(existing?.lorrigoOrderId ?? "").trim();

  if (existing && existing.lastNdrFingerprint === fp && existing.status === "Active" && !needsEnrichment) {
    recordNdrDuplicateSuppressed();
    return { upserted: false, duplicate: true, orderUpdated: false };
  }

  const now = new Date();
  const preserveStatus =
    existing?.status === "Initiated" || existing?.status === "Closed" ? existing.status : "Active";

  await NDR.findOneAndUpdate(
    { awb },
    {
      $set: {
        awb,
        customer,
        seller: prefer(seller, existing?.seller),
        reason: rec.reason || existing?.reason || "NDR",
        attempts: rec.attempts ?? existing?.attempts ?? 1,
        lastUpdate: formatLastUpdate(now),
        status: preserveStatus,
        phone,
        nextAction:
          existing?.status === "Initiated"
            ? existing.nextAction
            : rec.recommendedAction === "return"
              ? "Force RTO"
              : "Re-attempt",
        orderId,
        carrier,
        courierProvider: "lorrigo",
        providerStatus: rec.providerStatus ?? "NDR",
        velocityStatus: rec.providerStatus ?? "NDR",
        customerRemarks: prefer(rec.customerRemarks, existing?.customerRemarks),
        actionRequired: rec.actionRequired !== false,
        recommendedAction: rec.recommendedAction ?? existing?.recommendedAction ?? "reattempt",
        lastNdrFingerprint: fp,
        lorrigoOrderId,
        address,
        city,
        state,
        pincode,
        payment,
        amount,
      },
    },
    { upsert: true, new: true }
  );

  let orderUpdated = false;
  if (order) {
    const correlationId = ensureCorrelationId(order);
    const isDupEvent =
      Array.isArray(order.providerEvents) &&
      order.providerEvents.some(
        (e) =>
          e.type === "NDR_RECEIVED" &&
          e.metadata &&
          (e.metadata as { fingerprint?: string }).fingerprint === fp
      );

    if (!isDupEvent) {
      appendProviderEvent(order, {
        provider: "lorrigo",
        type: "NDR_RECEIVED",
        status: "SUCCESS",
        correlationId,
        message: rec.reason,
        metadata: { awb, fingerprint: fp, providerStatus: rec.providerStatus },
      });
    } else {
      recordNdrDuplicateSuppressed();
    }

    if (order.status !== "ndr") {
      const prev = order.statusHistory ?? [];
      order.statusHistory = [...prev, { status: "ndr", at: now, note: "lorrigo_ndr_sync" }].slice(
        -50
      );
      order.status = "ndr";
      order.shipmentStatus = rec.providerStatus ?? "NDR";
      orderUpdated = true;
    }
    await order.save();
  }

  return { upserted: true, duplicate: false, orderUpdated };
}

export async function syncNdrFromLorrigo(opts?: {
  daysBack?: number;
}): Promise<LorrigoNdrSyncResult> {
  const result: LorrigoNdrSyncResult = {
    fetched: 0,
    upserted: 0,
    ordersUpdated: 0,
    closed: 0,
    errors: 0,
    duplicatesSuppressed: 0,
    errorDetails: [],
  };

  if (!isLorrigoEnabledFlag() || !isLorrigoConfigured()) return result;

  const daysBack = opts?.daysBack ?? 30;
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    let rows: ProviderNdrRecord[];
    try {
      rows = await fetchLorrigoNdr({ daysBack, page, limit: 50 });
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      result.errorDetails = [...(result.errorDetails ?? []), msg].slice(0, 10);
      break;
    }

    if (!rows.length) break;
    result.fetched += rows.length;

    for (const rec of rows) {
      try {
        const r = await upsertNdrFromLorrigoRecord(rec);
        if (r.duplicate) result.duplicatesSuppressed += 1;
        if (r.upserted) result.upserted += 1;
        if (r.orderUpdated) result.ordersUpdated += 1;
      } catch (err) {
        result.errors += 1;
        const msg = err instanceof Error ? err.message : String(err);
        result.errorDetails = [...(result.errorDetails ?? []), `${rec.awb}: ${msg}`].slice(0, 10);
      }
    }

    if (rows.length < 50) break;
    page += 1;
  }

  try {
    result.closed = await closeResolvedLorrigoNdrRecords();
  } catch {
    // Non-fatal
  }

  console.info(
    `[lorrigo:ndr-sync] fetched=${result.fetched} upserted=${result.upserted} ` +
      `dupes=${result.duplicatesSuppressed} ordersUpdated=${result.ordersUpdated} ` +
      `closed=${result.closed} errors=${result.errors}`
  );
  return result;
}

/**
 * Close Lorrigo NDR records whose associated orders have moved to terminal statuses
 * (delivered, rto_delivered, cancelled). Called after sync.
 */
export async function closeResolvedLorrigoNdrRecords(): Promise<number> {
  const TERMINAL = ["delivered", "rto_delivered", "cancelled", "lost", "rto"];
  const activeNdrs = await NDR.find({ courierProvider: "lorrigo", status: "Active" })
    .select("awb orderId")
    .lean();
  if (!activeNdrs.length) return 0;

  const awbs = activeNdrs.map((n) => n.awb).filter(Boolean);
  const orderIds = activeNdrs.map((n) => n.orderId).filter(Boolean);

  const resolvedOrders = await Order.find({
    $or: [
      { awb: { $in: awbs }, courierProvider: "lorrigo", status: { $in: TERMINAL } },
      { orderId: { $in: orderIds }, courierProvider: "lorrigo", status: { $in: TERMINAL } },
    ],
  })
    .select("awb trackingId orderId status")
    .lean();

  const resolvedAwbs = new Set<string>();
  for (const o of resolvedOrders) {
    if (o.awb) resolvedAwbs.add(String(o.awb));
    if (o.trackingId) resolvedAwbs.add(String(o.trackingId));
    if (o.orderId) {
      const match = activeNdrs.find((n) => n.orderId === String(o.orderId));
      if (match) resolvedAwbs.add(match.awb);
    }
  }

  if (!resolvedAwbs.size) return 0;

  const result = await NDR.updateMany(
    { awb: { $in: [...resolvedAwbs] }, courierProvider: "lorrigo", status: { $ne: "Closed" } },
    { $set: { status: "Closed", actionRequired: false, lastUpdate: formatLastUpdate(new Date()) } }
  );

  const closed = result.modifiedCount ?? 0;
  if (closed > 0) {
    console.info(`[lorrigo:ndr-sync] closed=${closed} resolved Lorrigo NDR records`);
  }
  return closed;
}

export function getLorrigoNdrSyncIntervalMs(): number {
  const n = parseInt(process.env.LORRIGO_NDR_SYNC_INTERVAL_MS || "", 10);
  return Number.isFinite(n) && n >= 60_000 ? n : 10 * 60 * 1000;
}
