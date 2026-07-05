import type { HydratedDocument } from "mongoose";
import type { IOrder } from "../../models/Order.js";
import { Order } from "../../models/Order.js";
import { listShipments, trackShipment } from "./velocity.service.js";
import {
  appendRemarkHistory,
  extractFailureReasonFromShipmentRow,
  extractFailureReasonFromTracking,
  type IRemarkHistoryEntry,
} from "./velocityFailureReason.js";
import { mapVelocityStatus } from "./velocity.mapper.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import { devLog } from "../../utils/devLog.js";

const REMARK_SYNC_STATUSES = new Set([
  "cancelled",
  "ndr",
  "rto",
  "failed",
  "undelivered",
  "rejected",
  "need_attention",
  "needs_attention",
]);

function shouldSyncRemarkForStatus(rawStatus: unknown): boolean {
  const s = String(rawStatus ?? "").trim().toLowerCase();
  if (!s) return false;
  if (REMARK_SYNC_STATUSES.has(s)) return true;
  return [...REMARK_SYNC_STATUSES].some((k) => s.includes(k));
}

function applyRemarkToOrder(
  order: HydratedDocument<IOrder>,
  reason: string,
  source: string,
  velocityStatus?: string
): boolean {
  const text = reason.trim().slice(0, 2000);
  if (!text) return false;

  const history = appendRemarkHistory(
    order.remarkHistory as IRemarkHistoryEntry[] | undefined,
    text,
    source,
    velocityStatus
  );
  const changedHistory =
    JSON.stringify(history) !== JSON.stringify(order.remarkHistory ?? []);
  if (changedHistory) {
    order.remarkHistory = history;
  }
  if (order.adminRemark !== text) {
    order.adminRemark = text;
    return true;
  }
  return changedHistory;
}

export async function syncVelocityFailureRemarkForOrder(
  order: HydratedDocument<IOrder>,
  source: string
): Promise<boolean> {
  const awb = String(order.awb ?? "").trim();
  if (!awb) return false;

  try {
    const track = await trackShipment({ awb });
    const velocityStatus = String(track.status ?? order.shipmentStatus ?? "");
    const mapped = normalizeOrderStatus(mapVelocityStatus(velocityStatus));

    let reason = extractFailureReasonFromTracking(track);
    if (!reason && shouldSyncRemarkForStatus(velocityStatus)) {
      const shipmentList = await listShipments({ search: awb }).catch(() => null);
      const rows = Array.isArray(shipmentList?.data) ? shipmentList.data : [];
      const row = rows.find((r) => {
        const obj = r != null && typeof r === "object" ? (r as Record<string, unknown>) : {};
        const attrs =
          obj.attributes != null && typeof obj.attributes === "object"
            ? (obj.attributes as Record<string, unknown>)
            : obj;
        return String(attrs.tracking_number ?? attrs.awb ?? attrs.awb_code ?? "") === awb;
      });
      if (row) reason = extractFailureReasonFromShipmentRow(row);
    }

    if (!reason && shouldSyncRemarkForStatus(mapped)) {
      reason = velocityStatus;
    }

    if (!reason) return false;
    return applyRemarkToOrder(order, reason, source, velocityStatus);
  } catch (e: unknown) {
    devLog.warn(
      `[velocity:remark-sync] failed orderId=${order.orderId}:`,
      e instanceof Error ? e.message : e
    );
    return false;
  }
}

export async function syncVelocityFailureRemarkByAwb(
  order: HydratedDocument<IOrder>,
  trackResult: Awaited<ReturnType<typeof trackShipment>>,
  source: string
): Promise<boolean> {
  let reason = extractFailureReasonFromTracking(trackResult);
  const awb = String(order.awb ?? trackResult.awb ?? "").trim();
  const velocityStatus = String(trackResult.status ?? "");

  if (!reason && awb) {
    const shipmentList = await listShipments({ search: awb }).catch(() => null);
    const rows = Array.isArray(shipmentList?.data) ? shipmentList.data : [];
    const row = rows[0];
    if (row) reason = extractFailureReasonFromShipmentRow(row);
  }

  if (
    !reason &&
    (shouldSyncRemarkForStatus(velocityStatus) ||
      shouldSyncRemarkForStatus(normalizeOrderStatus(mapVelocityStatus(velocityStatus))))
  ) {
    reason = velocityStatus;
  }

  if (!reason) return false;
  return applyRemarkToOrder(order, reason, source, velocityStatus);
}

export async function syncFailureRemarksBatch(batchSize = 80): Promise<{ processed: number; updated: number }> {
  const orders = await Order.find({
    awb: { $exists: true, $nin: ["", null] },
    velocityShipmentId: { $exists: true, $nin: ["", null] },
    isJunk: { $ne: true },
    $or: [
      { status: { $in: ["cancelled", "ndr", "rto"] } },
      { shipmentStatus: { $regex: /fail|cancel|undeliver|reject|attention|ndr|rto/i } },
    ],
  })
    .select("_id orderId awb status shipmentStatus adminRemark remarkHistory velocityShipmentId")
    .limit(batchSize);

  let updated = 0;
  for (const lean of orders) {
    const doc = await Order.findById(lean._id);
    if (!doc) continue;
    const changed = await syncVelocityFailureRemarkForOrder(doc, "velocity_remark_batch");
    if (changed) {
      await doc.save();
      updated++;
    }
  }
  return { processed: orders.length, updated };
}
