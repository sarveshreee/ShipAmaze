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
  mapProviderRawToOrderStatus,
  providerCanonicalToOrderStatus,
  shouldApplyStatusUpdate,
  statusProgressRank,
  TERMINAL_ORDER_STATUS_VALUES,
  type ProviderCanonicalStatus,
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

function ekartRawKey(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Explicit Durin create-stage codes — safe to heal false in_transit. */
function isExplicitEkartCreateStage(raw: unknown): boolean {
  const k = ekartRawKey(raw);
  return (
    k === "shipment_created" ||
    k === "request_received" ||
    k === "shipment_details_received" ||
    k === "details_received" ||
    k === "created" ||
    k === "scheduled" ||
    k === "accepted" ||
    k === "updated" ||
    k === "lpd_generated"
  );
}

function activitiesShowPastPickup(
  activities: Array<{ activity?: string; date?: string }> | undefined
): boolean {
  if (!Array.isArray(activities) || activities.length === 0) return false;
  for (const a of activities) {
    const text = String(a.activity ?? "");
    const canonical = mapEkartStatusToProviderCanonical(text);
    if (
      canonical === "PICKED_UP" ||
      canonical === "IN_TRANSIT" ||
      canonical === "OUT_FOR_DELIVERY" ||
      canonical === "DELIVERED"
    ) {
      return true;
    }
  }
  return false;
}

function inferOrderStatusFromActivities(
  activities: Array<{ activity?: string }> | undefined
): string | undefined {
  if (!Array.isArray(activities) || activities.length === 0) return undefined;
  let best: ProviderCanonicalStatus | undefined;
  let bestRank = -1;
  const rank: Record<ProviderCanonicalStatus, number> = {
    CREATED: 10,
    PICKED_UP: 30,
    IN_TRANSIT: 35,
    OUT_FOR_DELIVERY: 45,
    FAILED: 50,
    CANCELLED: 55,
    RETURNED: 60,
    LOST: 60,
    DELIVERED: 70,
  };
  for (const a of activities) {
    const canonical = mapEkartStatusToProviderCanonical(a.activity);
    const r = rank[canonical] ?? 0;
    if (r > bestRank && canonical !== "CREATED") {
      bestRank = r;
      best = canonical;
    }
  }
  return best ? providerCanonicalToOrderStatus(best) : undefined;
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
    shipmentStatus: { $nin: ["reship", "cancelled", "lost"] },
    $or: [
      {
        status: { $nin: TERMINAL_ORDER_STATUS_VALUES },
        shipmentStatus: { $nin: ["delivered", "returned"] },
      },
      // Re-verify Delivered — prior max-rank history mapping forced false delivered
      // over later undelivered_attempted / RTO events.
      {
        status: { $in: ["delivered", "Delivered", "DELIVERED"] },
      },
    ],
  })
    .select(
      "_id orderId awb status shipmentStatus trackingActivities statusHistory providerEvents correlationId bookingVersion ekartTrackingId ekartClientReferenceId lastProviderStatusSyncedAt pickupDate"
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
      // Prefer classifier path (same as Lorrigo) so public pickup text advances tabs.
      let nextStatus = mapProviderRawToOrderStatus("ekart", rawStatus);
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

      const pastPickupInActivities = activitiesShowPastPickup(order.trackingActivities);

      // Courier confirmed pickup (date or activity) but status still booking-like — advance tab.
      if (
        (tracked.pickupDate || pastPickupInActivities) &&
        (nextStatus === "pickup_scheduled" ||
          nextStatus === "ready_to_ship" ||
          nextStatus === "draft" ||
          providerCanonical === "CREATED")
      ) {
        if (
          current === "pickup_scheduled" ||
          current === "ready_to_ship" ||
          current === "draft"
        ) {
          const inferred = inferOrderStatusFromActivities(order.trackingActivities);
          nextStatus = (inferred || "in_transit") as typeof nextStatus;
        } else if (providerCanonical === "CREATED") {
          // Already past pickup — keep current lifecycle (avoid picked_up ↔ in_transit churn
          // and do not heal back to pending_pickup when activities prove collection).
          nextStatus = current;
        }
      }

      if (tracked.pickupDate) {
        const pickupMs = Date.parse(tracked.pickupDate);
        if (!Number.isNaN(pickupMs)) {
          const pickupD = new Date(pickupMs);
          if (!order.pickupDate || order.pickupDate.getTime() !== pickupD.getTime()) {
            order.pickupDate = pickupD;
          }
        }
      }

      const sameStatus = current === nextStatus;
      // Only heal false in_transit for explicit create-stage codes with no pickup evidence.
      // Empty/partial Durin payloads previously reset real pickups back to Pending Pickup.
      const healFalseInTransit =
        providerCanonical === "CREATED" &&
        isExplicitEkartCreateStage(rawStatus) &&
        !tracked.pickupDate &&
        !pastPickupInActivities &&
        (current === "in_transit" || current === "picked_up");

      // Allow correcting false Delivered when Durin latest status is NDR / RTO / still moving.
      const healFalseDelivered =
        current === "delivered" &&
        nextStatus !== "delivered" &&
        (providerCanonical === "FAILED" ||
          providerCanonical === "RETURNED" ||
          providerCanonical === "IN_TRANSIT" ||
          providerCanonical === "OUT_FOR_DELIVERY" ||
          providerCanonical === "PICKED_UP" ||
          nextStatus === "ndr" ||
          nextStatus === "rto" ||
          nextStatus === "in_transit" ||
          nextStatus === "out_for_delivery");

      // Persist normalized lifecycle on shipmentStatus so Mongo tab queries stay accurate.
      let shipmentStatusToStore = rawShipmentStatus;
      if (
        !healFalseInTransit &&
        statusProgressRank(nextStatus) >
          statusProgressRank(normalizeOrderStatus(String(shipmentStatusToStore)))
      ) {
        shipmentStatusToStore = nextStatus;
      }
      if (
        !healFalseInTransit &&
        providerCanonical === "CREATED" &&
        (tracked.pickupDate || pastPickupInActivities) &&
        nextStatus !== "pickup_scheduled" &&
        nextStatus !== "draft" &&
        nextStatus !== "ready_to_ship"
      ) {
        shipmentStatusToStore = nextStatus;
      }

      if (order.shipmentStatus !== shipmentStatusToStore) {
        order.shipmentStatus = shipmentStatusToStore;
      }

      if (
        !sameStatus &&
        (healFalseInTransit ||
          healFalseDelivered ||
          nextStatus === "ndr" ||
          nextStatus === "rto" ||
          shouldApplyStatusUpdate(order.status, nextStatus))
      ) {
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
            healFalseDelivered: healFalseDelivered || undefined,
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
