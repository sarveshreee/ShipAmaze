/**
 * Ekart background status sync — polls active shipments via CourierProvider.trackShipment.
 * Reuses Lorrigo patterns: timeline events, duplicate suppression, terminal skip.
 */

import { Order, type IOrder } from "../../models/Order.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import { getCourierProvider } from "../courier/providerRegistry.js";
import { appendProviderEvent } from "../courier/providerEvents.js";
import { ensureCorrelationId } from "../courier/correlation.js";
import {
  mapEkartStatusToProviderCanonical,
  providerCanonicalToOrderStatus,
  shouldApplyStatusUpdate,
  TERMINAL_ORDER_STATUS_VALUES,
} from "../courier/statusNormalize.js";
import { isEkartConfigured, isEkartEnabledFlag } from "./ekart.config.js";
import { recordEkartStatusSyncPoll } from "./ekart.statusSyncMetrics.js";
import { markWalletDebitPendingIfBookedWithoutDebit } from "../../services/walletDebitReconciliation.js";

export type EkartStatusSyncResult = {
  processed: number;
  updated: number;
  errors: number;
  skipped: number;
  statusChanges: number;
  errorDetails?: string[];
};

function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n >= 30_000 ? n : fallback;
}

/** Env-configurable poll interval (default 5 minutes). */
export function getEkartStatusSyncIntervalMs(): number {
  return intEnv("EKART_STATUS_SYNC_INTERVAL_MS", 5 * 60 * 1000);
}

function appendStatusHistory(order: IOrder, status: string, note: string) {
  const prev = order.statusHistory ?? [];
  order.statusHistory = [...prev, { status, at: new Date(), note }].slice(-50);
  if (typeof order.markModified === "function") order.markModified("statusHistory");
}

/**
 * Sync active Ekart shipments only.
 * Skips delivered / cancelled / returned / lost (and ShipAmaze terminal statuses).
 * Same status repeatedly: bump lastSyncedAt only — no duplicate timeline events.
 */
export async function syncEkartActiveShipmentStatuses(
  batchSize = 100
): Promise<EkartStatusSyncResult> {
  const result: EkartStatusSyncResult = {
    processed: 0,
    updated: 0,
    errors: 0,
    skipped: 0,
    statusChanges: 0,
    errorDetails: [],
  };
  const started = Date.now();

  if (!isEkartEnabledFlag() || !isEkartConfigured()) {
    return result;
  }

  let provider;
  try {
    provider = getCourierProvider("ekart");
  } catch {
    return result;
  }
  if (!provider.isConfigured() || !provider.capabilities.tracking) {
    return result;
  }

  const orders = await Order.find({
    courierProvider: "ekart",
    awb: { $exists: true, $nin: ["", null] },
    shipmentCreated: true,
    isJunk: { $ne: true },
    status: { $nin: TERMINAL_ORDER_STATUS_VALUES },
    shipmentStatus: { $nin: ["reship", "delivered", "cancelled", "returned", "lost"] },
  })
    .select(
      "_id orderId awb status shipmentStatus trackingActivities statusHistory providerEvents correlationId bookingVersion ekartTrackingId ekartClientReferenceId lastProviderStatusSyncedAt"
    )
    .sort({ lastProviderStatusSyncedAt: 1, updatedAt: 1 })
    .limit(batchSize)
    .exec();

  let providerLatencyTotal = 0;
  let providerCalls = 0;
  let hadSuccess = false;

  for (const order of orders) {
    result.processed += 1;
    const awb = String(order.awb ?? "").trim();
    if (!awb) {
      result.skipped += 1;
      continue;
    }

    const correlationId = ensureCorrelationId(order);
    const trackStarted = Date.now();

    try {
      const tracked = await provider.trackShipment({ awb });
      const providerLatency = Date.now() - trackStarted;
      providerLatencyTotal += providerLatency;
      providerCalls += 1;
      hadSuccess = true;

      const rawStatus = tracked.status;
      if (!rawStatus || !String(rawStatus).trim()) {
        result.errors += 1;
        order.lastProviderStatusSyncedAt = new Date();
        appendProviderEvent(order, {
          provider: "ekart",
          type: "TRACKING_FAILED",
          status: "FAILED",
          durationMs: providerLatency,
          correlationId,
          message: "Empty status from Ekart",
        });
        await order.save();
        continue;
      }

      const providerCanonical = mapEkartStatusToProviderCanonical(rawStatus);
      const nextStatus = providerCanonicalToOrderStatus(providerCanonical);
      const current = normalizeOrderStatus(order.status);
      const rawShipmentStatus = String(rawStatus);

      // Always refresh activities when provided (replace snapshot).
      if (Array.isArray(tracked.activities) && tracked.activities.length > 0) {
        order.trackingActivities = tracked.activities.map((a) => ({
          date: a.date,
          activity: a.activity,
          location: a.location,
        }));
      }

      const sameStatus = current === nextStatus;
      const healFalseInTransit =
        providerCanonical === "CREATED" &&
        (current === "in_transit" || current === "picked_up");

      if (order.shipmentStatus !== rawShipmentStatus) {
        order.shipmentStatus = rawShipmentStatus;
      }

      if (!sameStatus && (healFalseInTransit || shouldApplyStatusUpdate(order.status, nextStatus))) {
        appendStatusHistory(order, nextStatus, "ekart_bg_sync");
        order.status = nextStatus;
        result.statusChanges += 1;
        appendProviderEvent(order, {
          provider: "ekart",
          type: "STATUS_CHANGE",
          status: "SUCCESS",
          durationMs: providerLatency,
          correlationId,
          message: `${current} → ${nextStatus}`,
          metadata: {
            providerCanonical,
            rawStatus: rawShipmentStatus,
          },
        });
      }
      // Same status repeatedly: do not duplicate timeline entries — only bump lastSyncedAt.

      order.lastProviderStatusSyncedAt = new Date();
      await order.save();
      await markWalletDebitPendingIfBookedWithoutDebit(order);
      result.updated += 1;
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      if ((result.errorDetails?.length ?? 0) < 10) {
        result.errorDetails = [...(result.errorDetails ?? []), `${order.orderId}: ${msg}`];
      }
      try {
        order.lastProviderStatusSyncedAt = new Date();
        appendProviderEvent(order, {
          provider: "ekart",
          type: "TRACKING_FAILED",
          status: "FAILED",
          durationMs: Date.now() - trackStarted,
          correlationId,
          message: msg.slice(0, 300),
        });
        await order.save();
      } catch {
        await Order.updateOne(
          { _id: order._id },
          { $set: { lastProviderStatusSyncedAt: new Date() } }
        ).catch(() => undefined);
      }
    }
  }

  const latencyMs = Date.now() - started;
  recordEkartStatusSyncPoll({
    activeShipments: orders.length,
    latencyMs,
    providerLatencyMs: providerCalls > 0 ? Math.round(providerLatencyTotal / providerCalls) : undefined,
    statusChanges: result.statusChanges,
    failures: result.errors,
    hadSuccess,
  });

  console.info(
    `[ekart:status-sync] processed=${result.processed} updated=${result.updated} ` +
      `statusChanges=${result.statusChanges} errors=${result.errors} skipped=${result.skipped} latencyMs=${latencyMs}`
  );

  return result;
}
