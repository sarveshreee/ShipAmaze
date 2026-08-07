/**
 * Lorrigo background status sync — polls active shipments via CourierProvider.trackShipment.
 * Does not modify Velocity status sync.
 */

import { Order, type IOrder } from "../../models/Order.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import { getCourierProvider } from "../courier/providerRegistry.js";
import { appendProviderEvent } from "../courier/providerEvents.js";
import { ensureCorrelationId } from "../courier/correlation.js";
import {
  mapLorrigoStatusToProviderCanonical,
  mapProviderRawToOrderStatus,
  shouldApplyStatusUpdate,
  TERMINAL_ORDER_STATUS_VALUES,
} from "../courier/statusNormalize.js";
import { recordStatusSyncPoll } from "./lorrigo.statusSyncMetrics.js";
import { isLorrigoEnabledFlag, isLorrigoConfigured } from "./lorrigo.config.js";

export type LorrigoStatusSyncResult = {
  processed: number;
  updated: number;
  errors: number;
  skipped: number;
  statusChanges: number;
  errorDetails?: string[];
};

function appendStatusHistory(order: IOrder, status: string, note: string) {
  const prev = order.statusHistory ?? [];
  order.statusHistory = [...prev, { status, at: new Date(), note }].slice(-50);
  if (typeof order.markModified === "function") order.markModified("statusHistory");
}

/**
 * Sync active Lorrigo shipments.
 * Skips delivered / cancelled / returned / lost (and ShipAmaze terminal statuses).
 */
export async function syncLorrigoActiveShipmentStatuses(
  batchSize = 100
): Promise<LorrigoStatusSyncResult> {
  const result: LorrigoStatusSyncResult = {
    processed: 0,
    updated: 0,
    errors: 0,
    skipped: 0,
    statusChanges: 0,
    errorDetails: [],
  };
  const started = Date.now();

  if (!isLorrigoEnabledFlag() || !isLorrigoConfigured()) {
    return result;
  }

  let provider;
  try {
    provider = getCourierProvider("lorrigo");
  } catch {
    return result;
  }
  if (!provider.isConfigured() || !provider.capabilities.tracking) {
    return result;
  }

  const orders = await Order.find({
    courierProvider: "lorrigo",
    awb: { $exists: true, $nin: ["", null] },
    shipmentCreated: true,
    isJunk: { $ne: true },
    status: { $nin: TERMINAL_ORDER_STATUS_VALUES },
    shipmentStatus: { $nin: ["reship", "delivered", "cancelled", "returned", "lost"] },
  })
    .select(
      "_id orderId awb status shipmentStatus trackingActivities statusHistory providerEvents correlationId bookingVersion lorrigoOrderId lastProviderStatusSyncedAt"
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

    const moveCancelledToReship = async (
      rawShipmentStatus: string,
      providerLatency: number,
      note: string
    ) => {
      const current = normalizeOrderStatus(order.status);
      const alreadyReship = String(order.status ?? "").toLowerCase().replace(/-/g, "_") === "reship";
      order.shipmentCreated = false;
      order.awb = "";
      order.trackingId = undefined;
      order.shipmentId = undefined;
      order.lorrigoOrderId = undefined;
      order.lorrigoShipmentId = undefined;
      order.labelUrl = undefined;
      order.trackingUrl = undefined;
      order.trackingActivities = undefined;
      order.bookingInProgress = false;
      // `reship` is a stored workflow status (normalizeOrderStatus maps it to ready_to_ship).
      if (!alreadyReship) {
        appendStatusHistory(order, "reship", note);
        order.status = "reship";
        result.statusChanges += 1;
      }
      order.shipmentStatus = "reship";
      order.lastProviderStatusSyncedAt = new Date();
      appendProviderEvent(order, {
        provider: "lorrigo",
        type: "STATUS_CHANGE",
        status: "SUCCESS",
        durationMs: providerLatency,
        correlationId,
        message: `${current} → reship (Lorrigo cancelled)`,
        metadata: { providerCanonical: "CANCELLED", rawStatus: rawShipmentStatus },
      });
      await order.save();
      result.updated += 1;
      console.info(
        `[lorrigo:status-sync] moved cancelled Lorrigo order to reship orderId=${order.orderId}`
      );
    };

    // Heal stuck rows where shipmentStatus is already CANCELLED_ORDER but Order.status lagged.
    if (mapLorrigoStatusToProviderCanonical(order.shipmentStatus) === "CANCELLED") {
      await moveCancelledToReship(String(order.shipmentStatus ?? "CANCELLED"), 0, "lorrigo_cancelled_to_reship");
      continue;
    }

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
          provider: "lorrigo",
          type: "TRACKING_FAILED",
          status: "FAILED",
          durationMs: providerLatency,
          correlationId,
          message: "Empty status from Lorrigo",
        });
        await order.save();
        continue;
      }

      const providerCanonical = mapLorrigoStatusToProviderCanonical(rawStatus);
      const nextStatus = mapProviderRawToOrderStatus("lorrigo", rawStatus);
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

      // Match Velocity: external cancel → Reship (clear AWB so the order can be rebooked).
      if (providerCanonical === "CANCELLED") {
        await moveCancelledToReship(rawShipmentStatus, providerLatency, "lorrigo_cancelled_to_reship");
        continue;
      }

      const sameStatus = current === nextStatus;
      const rawKey = String(rawStatus)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const healMisMappedPickup =
        providerCanonical === "CREATED" &&
        current === "in_transit" &&
        (rawKey === "out_for_pickup" || rawKey === "pickup_out_for_pickup");
      const healPickupException =
        rawKey === "pickup_exception" &&
        (current === "in_transit" || current === "pickup_failed" || current === "pickup_scheduled");

      if (order.shipmentStatus !== rawShipmentStatus) {
        order.shipmentStatus = rawShipmentStatus;
      }

      if (
        (!sameStatus && shouldApplyStatusUpdate(order.status, nextStatus)) ||
        healMisMappedPickup ||
        healPickupException
      ) {
        appendStatusHistory(order, nextStatus, "lorrigo_bg_sync");
        order.status = nextStatus;
        result.statusChanges += 1;
        appendProviderEvent(order, {
          provider: "lorrigo",
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
          provider: "lorrigo",
          type: "TRACKING_FAILED",
          status: "FAILED",
          durationMs: Date.now() - trackStarted,
          correlationId,
          message: msg,
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
  recordStatusSyncPoll({
    activeShipments: orders.length,
    latencyMs,
    providerLatencyMs: providerCalls > 0 ? Math.round(providerLatencyTotal / providerCalls) : undefined,
    statusChanges: result.statusChanges,
    failures: result.errors,
    hadSuccess,
  });

  console.info(
    `[lorrigo:status-sync] processed=${result.processed} updated=${result.updated} ` +
      `statusChanges=${result.statusChanges} errors=${result.errors} skipped=${result.skipped} latencyMs=${latencyMs}`
  );

  return result;
}

/** Env-configurable poll interval (default 5 minutes). */
export function getLorrigoStatusSyncIntervalMs(): number {
  const n = parseInt(process.env.LORRIGO_STATUS_SYNC_INTERVAL_MS || "", 10);
  return Number.isFinite(n) && n >= 30_000 ? n : 5 * 60 * 1000;
}
