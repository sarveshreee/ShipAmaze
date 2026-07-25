/**
 * Lorrigo NDR sync — upserts into shared NDR collection; leaves Velocity sync untouched.
 */

import { createHash } from "crypto";
import { NDR } from "../../models/NDR.js";
import { Order } from "../../models/Order.js";
import { appendProviderEvent } from "../courier/providerEvents.js";
import { ensureCorrelationId } from "../courier/correlation.js";
import type { ProviderNdrRecord } from "../courier/types.js";
import { fetchLorrigoNdr } from "./lorrigo.ndr.js";
import { recordNdrDuplicateSuppressed } from "./lorrigo.ndrMetrics.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag } from "./lorrigo.config.js";

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

export async function upsertNdrFromLorrigoRecord(
  rec: ProviderNdrRecord
): Promise<{ upserted: boolean; duplicate: boolean; orderUpdated: boolean }> {
  const awb = rec.awb.trim();
  if (!awb) return { upserted: false, duplicate: false, orderUpdated: false };

  const fp = fingerprint(rec);
  const existing = await NDR.findOne({ awb });
  if (existing && existing.lastNdrFingerprint === fp && existing.status === "Active") {
    recordNdrDuplicateSuppressed();
    return { upserted: false, duplicate: true, orderUpdated: false };
  }

  const now = new Date();
  await NDR.findOneAndUpdate(
    { awb },
    {
      $set: {
        awb,
        customer: rec.customerName ?? existing?.customer ?? "",
        seller: existing?.seller ?? "",
        reason: rec.reason,
        attempts: rec.attempts ?? existing?.attempts ?? 1,
        lastUpdate: formatLastUpdate(now),
        status: existing?.status === "Initiated" ? "Initiated" : "Active",
        phone: rec.phone ?? existing?.phone ?? "",
        nextAction: rec.recommendedAction === "return" ? "Force RTO" : "Re-attempt",
        orderId: rec.orderId ?? existing?.orderId ?? "",
        carrier: rec.carrier ?? existing?.carrier ?? "",
        courierProvider: "lorrigo",
        providerStatus: rec.providerStatus ?? "NDR",
        velocityStatus: rec.providerStatus ?? "NDR",
        customerRemarks: rec.customerRemarks ?? "",
        actionRequired: rec.actionRequired !== false,
        recommendedAction: rec.recommendedAction ?? "reattempt",
        lastNdrFingerprint: fp,
        amount: rec.amount ?? existing?.amount,
      },
    },
    { upsert: true, new: true }
  );

  let orderUpdated = false;
  const order = await Order.findOne({
    $or: [{ awb }, { trackingId: awb }, { orderId: rec.orderId }],
    courierProvider: "lorrigo",
  });
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
      order.statusHistory = [
        ...prev,
        { status: "ndr", at: now, note: "lorrigo_ndr_sync" },
      ].slice(-50);
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

  console.info(
    `[lorrigo:ndr-sync] fetched=${result.fetched} upserted=${result.upserted} ` +
      `dupes=${result.duplicatesSuppressed} ordersUpdated=${result.ordersUpdated} errors=${result.errors}`
  );
  return result;
}

export function getLorrigoNdrSyncIntervalMs(): number {
  const n = parseInt(process.env.LORRIGO_NDR_SYNC_INTERVAL_MS || "", 10);
  return Number.isFinite(n) && n >= 60_000 ? n : 10 * 60 * 1000;
}
