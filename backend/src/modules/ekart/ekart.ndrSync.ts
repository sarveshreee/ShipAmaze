/**
 * Upsert ShipAmaze NDR rows from Ekart orders that Durin already marked undelivered.
 * Durin Non-Large has no NDR list API — local ndr status + track is the source.
 */

import { createHash } from "crypto";
import { NDR } from "../../models/NDR.js";
import { Order, type IOrder } from "../../models/Order.js";
import { Vendor } from "../../models/Vendor.js";
import { appendProviderEvent } from "../courier/providerEvents.js";
import { ensureCorrelationId } from "../courier/correlation.js";
import { NDR_MATCH_VALUES } from "../../utils/orderStatusClassifier.js";
import { isEkartConfigured, isEkartEnabledFlag } from "./ekart.config.js";
import type { HydratedDocument } from "mongoose";

export type EkartNdrSyncResult = {
  fetched: number;
  upserted: number;
  closed: number;
  errors: number;
  duplicatesSuppressed: number;
  errorDetails?: string[];
};

function formatLastUpdate(d = new Date()): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function prefer(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export function humanizeEkartNdrReason(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "NDR";
  if (/\s/.test(s)) return s;
  const cleaned = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "NDR";
}

function fingerprint(awb: string, reason: string, providerStatus: string): string {
  return createHash("sha1").update([awb, reason, providerStatus].join("|")).digest("hex").slice(0, 16);
}

type EkartNdrOrderLike = {
  orderId?: string;
  awb?: string;
  ekartTrackingId?: string;
  customer?: string;
  phone?: string;
  customerPhone?: string;
  courierName?: string;
  courier?: string;
  payment?: string;
  amount?: number;
  shippingAddress1?: string;
  address?: string;
  shippingCity?: string;
  city?: string;
  shippingState?: string;
  state?: string;
  shippingPincode?: string;
  pincode?: string;
  vendorId?: unknown;
  pickupAddress?: IOrder["pickupAddress"];
  channel?: string;
  shopifyStoreName?: string;
  shipmentStatus?: string;
  trackingActivities?: Array<{ activity?: string }>;
  providerEvents?: IOrder["providerEvents"];
  markModified?: IOrder["markModified"];
  status?: string;
};

async function resolveSeller(order: EkartNdrOrderLike): Promise<string> {
  if (order.vendorId) {
    try {
      const vendor = await Vendor.findById(order.vendorId).select("name").lean();
      if (vendor?.name) return String(vendor.name);
    } catch {
      /* ignore */
    }
  }
  const pickup = order.pickupAddress;
  if (pickup && typeof pickup === "object" && pickup.label) return String(pickup.label);
  return prefer(order.channel, order.shopifyStoreName);
}

export async function upsertEkartNdrFromOrder(
  order: EkartNdrOrderLike,
  opts?: { reason?: string; providerStatus?: string; attempts?: number }
): Promise<{ upserted: boolean; duplicate: boolean }> {
  const awb = prefer(order.awb, order.ekartTrackingId);
  if (!awb) return { upserted: false, duplicate: false };

  const activityReason = prefer(
    ...(Array.isArray(order.trackingActivities)
      ? order.trackingActivities.map((a) => a?.activity)
      : [])
  );
  const providerStatus = prefer(opts?.providerStatus, order.shipmentStatus, "ndr");
  const reason = humanizeEkartNdrReason(
    prefer(opts?.reason, activityReason, providerStatus, "NDR")
  );
  const fp = fingerprint(awb, reason, providerStatus);
  const existing = await NDR.findOne({ awb });

  if (existing && existing.lastNdrFingerprint === fp && existing.status === "Active") {
    return { upserted: false, duplicate: true };
  }

  const seller = await resolveSeller(order);
  const preserveStatus =
    existing?.status === "Initiated" || existing?.status === "Closed" ? existing.status : "Active";

  await NDR.findOneAndUpdate(
    { awb },
    {
      $set: {
        awb,
        customer: prefer(order.customer, existing?.customer),
        seller: prefer(seller, existing?.seller),
        reason: reason || existing?.reason || "NDR",
        attempts: opts?.attempts ?? existing?.attempts ?? 1,
        lastUpdate: formatLastUpdate(),
        status: preserveStatus,
        phone: prefer(order.phone, order.customerPhone, existing?.phone),
        nextAction: existing?.status === "Initiated" ? existing.nextAction : "Re-attempt",
        orderId: prefer(order.orderId, existing?.orderId),
        carrier: prefer(order.courierName, order.courier, existing?.carrier, "Ekart"),
        courierProvider: "ekart",
        providerStatus,
        velocityStatus: providerStatus,
        customerRemarks: prefer(activityReason, existing?.customerRemarks),
        actionRequired: preserveStatus === "Active",
        recommendedAction: existing?.recommendedAction || "reattempt",
        lastNdrFingerprint: fp,
        address: prefer(order.shippingAddress1, order.address, existing?.address),
        city: prefer(order.shippingCity, order.city, existing?.city),
        state: prefer(order.shippingState, order.state, existing?.state),
        pincode: prefer(order.shippingPincode, order.pincode, existing?.pincode),
        payment: prefer(order.payment, existing?.payment),
        amount:
          order.amount != null && Number.isFinite(Number(order.amount))
            ? Number(order.amount)
            : existing?.amount,
      },
    },
    { upsert: true, new: true }
  );

  const hydrated = order as HydratedDocument<IOrder>;
  if (typeof hydrated.markModified === "function") {
    const correlationId = ensureCorrelationId(hydrated);
    const isDupEvent =
      Array.isArray(hydrated.providerEvents) &&
      hydrated.providerEvents.some(
        (e) =>
          e.type === "NDR_RECEIVED" &&
          e.metadata &&
          (e.metadata as { fingerprint?: string }).fingerprint === fp
      );
    if (!isDupEvent) {
      appendProviderEvent(hydrated, {
        provider: "ekart",
        type: "NDR_RECEIVED",
        status: "SUCCESS",
        correlationId,
        message: reason,
        metadata: { awb, fingerprint: fp, providerStatus },
      });
    }
  }

  return { upserted: true, duplicate: false };
}

export async function closeResolvedEkartNdrRecords(): Promise<number> {
  const TERMINAL = ["delivered", "rto_delivered", "cancelled", "lost", "rto", "reship"];
  const flipkartAwb = /^[A-Za-z]{3}[PCR]\d{10}$/i;
  const activeNdrs = await NDR.find({
    status: { $in: ["Active", "Initiated"] },
    $or: [{ courierProvider: "ekart" }, { awb: flipkartAwb }],
  })
    .select("awb orderId")
    .lean();
  if (!activeNdrs.length) return 0;

  const awbs = activeNdrs.map((n) => n.awb).filter(Boolean);
  const orderIds = activeNdrs.map((n) => n.orderId).filter((id): id is string => Boolean(id));

  const resolvedOrders = await Order.find({
    $or: [
      { awb: { $in: awbs } },
      { ekartTrackingId: { $in: awbs } },
      { orderId: { $in: orderIds } },
    ],
    status: { $in: TERMINAL },
  })
    .select("awb ekartTrackingId orderId")
    .lean();

  const resolvedAwbs = new Set<string>();
  for (const o of resolvedOrders) {
    if (o.awb) resolvedAwbs.add(String(o.awb));
    if (o.ekartTrackingId) resolvedAwbs.add(String(o.ekartTrackingId));
    if (o.orderId) {
      const match = activeNdrs.find((n) => n.orderId === String(o.orderId));
      if (match) resolvedAwbs.add(match.awb);
    }
  }
  if (!resolvedAwbs.size) return 0;

  const result = await NDR.updateMany(
    {
      awb: { $in: [...resolvedAwbs] },
      status: { $ne: "Closed" },
      $or: [{ courierProvider: "ekart" }, { courierProvider: { $exists: false } }, { courierProvider: null }],
    },
    { $set: { status: "Closed", actionRequired: false, lastUpdate: formatLastUpdate() } }
  );
  return result.modifiedCount ?? 0;
}

export async function syncNdrFromEkart(opts?: { daysBack?: number }): Promise<EkartNdrSyncResult> {
  const result: EkartNdrSyncResult = {
    fetched: 0,
    upserted: 0,
    closed: 0,
    errors: 0,
    duplicatesSuppressed: 0,
    errorDetails: [],
  };
  if (!isEkartEnabledFlag() || !isEkartConfigured()) return result;

  const daysBack = opts?.daysBack ?? 30;
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const orders = await Order.find({
    courierProvider: "ekart",
    isJunk: { $ne: true },
    $or: [{ status: { $in: NDR_MATCH_VALUES } }, { shipmentStatus: { $in: NDR_MATCH_VALUES } }],
    updatedAt: { $gte: since },
  })
    .select(
      "orderId awb ekartTrackingId customer phone customerPhone courierName courier payment amount shippingAddress1 address shippingCity city shippingState state shippingPincode pincode vendorId pickupAddress channel shopifyStoreName shipmentStatus trackingActivities providerEvents status"
    )
    .limit(500)
    .exec();

  result.fetched = orders.length;
  for (const order of orders) {
    try {
      const r = await upsertEkartNdrFromOrder(order, {
        providerStatus: String(order.shipmentStatus ?? "ndr"),
      });
      if (r.duplicate) result.duplicatesSuppressed += 1;
      if (r.upserted) {
        result.upserted += 1;
        await order.save();
      }
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      result.errorDetails = [...(result.errorDetails ?? []), `${order.awb}: ${msg}`].slice(0, 10);
    }
  }

  try {
    result.closed = await closeResolvedEkartNdrRecords();
  } catch {
    /* non-fatal */
  }

  console.info(
    `[ekart:ndr-sync] fetched=${result.fetched} upserted=${result.upserted} ` +
      `dupes=${result.duplicatesSuppressed} closed=${result.closed} errors=${result.errors}`
  );
  return result;
}

export function getEkartNdrSyncIntervalMs(): number {
  const n = parseInt(process.env.EKART_NDR_SYNC_INTERVAL_MS || "", 10);
  return Number.isFinite(n) && n >= 60_000 ? n : 10 * 60 * 1000;
}
