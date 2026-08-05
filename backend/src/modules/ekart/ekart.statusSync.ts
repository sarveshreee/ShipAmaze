/**
 * Ekart background status sync — polls active shipments via trackShipment.
 */

import { Order, type IOrder } from "../../models/Order.js";
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

export function getEkartStatusSyncIntervalMs(): number {
  return intEnv("EKART_STATUS_SYNC_INTERVAL_MS", 300_000);
}

function appendStatusHistory(order: IOrder, status: string, note: string) {
  const prev = order.statusHistory ?? [];
  order.statusHistory = [...prev, { status, at: new Date(), note }].slice(-50);
  if (typeof order.markModified === "function") order.markModified("statusHistory");
}

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
      "_id orderId awb status shipmentStatus trackingActivities statusHistory providerEvents correlationId bookingVersion ekartTrackingId lastProviderStatusSyncedAt"
    )
    .sort({ lastProviderStatusSyncedAt: 1, updatedAt: 1 })
    .limit(batchSize)
    .exec();

  let hadSuccess = false;

  for (const order of orders) {
    result.processed += 1;
    const awb = String(order.awb ?? "").trim();
    if (!awb) {
      result.skipped += 1;
      continue;
    }

    const correlationId = ensureCorrelationId(order);
    try {
      const tracked = await provider.trackShipment({ awb });
      hadSuccess = true;
      const canonical = mapEkartStatusToProviderCanonical(tracked.status);
      const nextStatus = providerCanonicalToOrderStatus(canonical);
      const activities = (tracked.activities ?? []).map((a) => ({
        date: a.date,
        activity: a.activity,
        location: a.location,
      }));

      order.trackingActivities = activities;
      order.shipmentStatus = tracked.status;
      order.lastProviderStatusSyncedAt = new Date();

      if (shouldApplyStatusUpdate(String(order.status ?? ""), nextStatus)) {
        appendStatusHistory(order, nextStatus, `Ekart track: ${tracked.status}`);
        order.status = nextStatus;
        result.statusChanges += 1;
      }

      appendProviderEvent(order, {
        provider: "ekart",
        type: "TRACKING_SYNC",
        status: "SUCCESS",
        correlationId,
        message: tracked.status,
        metadata: { awb, canonical },
      });

      await order.save();
      result.updated += 1;
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      result.errorDetails = [...(result.errorDetails ?? []), `${order.orderId}: ${msg}`].slice(
        -20
      );
      appendProviderEvent(order, {
        provider: "ekart",
        type: "TRACKING_FAILED",
        status: "FAILED",
        correlationId,
        message: msg.slice(0, 300),
      });
      try {
        order.lastProviderStatusSyncedAt = new Date();
        await order.save();
      } catch {
        /* ignore */
      }
    }
  }

  recordEkartStatusSyncPoll({
    processed: result.processed,
    updated: result.updated,
    errors: result.errors,
    durationMs: Date.now() - started,
    ok: hadSuccess || result.errors === 0,
  });

  return result;
}
