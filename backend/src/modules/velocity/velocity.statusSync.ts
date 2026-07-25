/**
 * Velocity Shipping – bulk shipment status sync.
 *
 * Fetches active orders that have an AWB, calls the Velocity tracking API for
 * each, and persists the result so website tabs stay in sync with Velocity.
 *
 * Designed to be called:
 *   • From the background interval in server.ts (every ~5 minutes).
 *   • From the admin API endpoint POST /velocity/sync-statuses (on-demand).
 */

import { Order } from "../../models/Order.js";
import { listShipments, trackShipment } from "./velocity.service.js";
import { mapVelocityStatus, shouldApplyInternalStatusUpdate } from "./velocity.mapper.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import { mirrorShopifyFulfillmentStatus, pushShopifyFulfillmentUpdate } from "../../services/shopifyFulfillmentMirror.js";
import { upsertNdrFromVelocityShipment } from "./velocity.ndrSync.js";
import { syncVelocityFailureRemarkByAwb } from "./velocityRemarkSync.js";

/** Terminal / closed statuses that do not need further Velocity polling. */
const TERMINAL_STATUS_VALUES = [
  "delivered",
  "Delivered",
  "cancelled",
  "canceled",
  "Cancelled",
  "Canceled",
  "rto",
  "RTO",
  "rto_delivered",
  "RTO Delivered",
  "reship",
  "junk",
];

export interface StatusSyncResult {
  processed: number;
  updated: number;
  errors: number;
  skipped: number;
  /** Sample error messages (up to 10) for surfacing to admin UI / logs. */
  errorDetails?: string[];
}

/** Always-on sync logger so failed status syncs are visible in production. */
function syncLog(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function extractVelocityShipmentEdd(row: unknown): string | undefined {
  const obj = row != null && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const attrs =
    obj.attributes != null && typeof obj.attributes === "object"
      ? (obj.attributes as Record<string, unknown>)
      : obj;

  const milestones = Array.isArray(attrs.shipment_milestones)
    ? (attrs.shipment_milestones as Record<string, unknown>[])
    : [];
  const original = milestones.find((m) => String(m.milestone ?? "") === "original_expected_delivery_date");
  const current = milestones.find((m) => String(m.milestone ?? "") === "expected_delivery_date");
  const value = original?.milestone_at ?? current?.milestone_at;
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function getVelocityDeliveryDateForAwb(awb: string): Promise<string | undefined> {
  const result = await listShipments({ search: awb });
  const rows = Array.isArray(result.data) ? result.data : [];
  const row = rows.find((r) => {
    const obj = r != null && typeof r === "object" ? (r as Record<string, unknown>) : {};
    const attrs =
      obj.attributes != null && typeof obj.attributes === "object"
        ? (obj.attributes as Record<string, unknown>)
        : obj;
    return String(attrs.tracking_number ?? attrs.awb ?? attrs.awb_code ?? "") === awb;
  });
  return extractVelocityShipmentEdd(row);
}

function appendHistoryEntry(
  order: InstanceType<typeof Order>,
  status: string,
  note: string
) {
  const prev = (order.statusHistory as { status: string; at: Date; note?: string }[] | undefined) ?? [];
  (order as unknown as { statusHistory: unknown[] }).statusHistory = [
    ...prev,
    { status, at: new Date(), note },
  ].slice(-50);
}

function isVelocityCancellationStatus(status: unknown): boolean {
  const mapped = normalizeOrderStatus(mapVelocityStatus(status));
  return mapped === "cancelled";
}

function clearShipmentForReship(order: InstanceType<typeof Order>) {
  order.shipmentCreated = false;
  order.awb = "";
  order.trackingId = undefined;
  order.shipmentId = undefined;
  order.velocityOrderId = undefined;
  order.velocityShipmentId = undefined;
  order.velocityReturnId = undefined;
  order.labelUrl = undefined;
  order.manifestUrl = undefined;
  order.trackingUrl = undefined;
  order.trackingActivities = undefined;
}

function markSynced(order: InstanceType<typeof Order>) {
  order.lastVelocityStatusSyncedAt = new Date();
}

/**
 * Refresh active Velocity shipments whose lifecycle is not yet terminal.
 *
 * Uses exclusion of terminal statuses (not a brittle include-list) and fair
 * rotation via `lastVelocityStatusSyncedAt` so every order is eventually polled
 * even when the active set exceeds `batchSize`.
 *
 * @param batchSize - max orders to process per call (default 100 to avoid timeouts)
 */
export async function syncActiveShipmentStatuses(
  batchSize = 100
): Promise<StatusSyncResult> {
  const result: StatusSyncResult = { processed: 0, updated: 0, errors: 0, skipped: 0, errorDetails: [] };
  const startedAt = Date.now();

  const orders = await Order.find({
    awb: { $exists: true, $nin: ["", null] },
    // Prefer Velocity shipment id; also accept legacy `shipmentId` so older rows sync.
    $or: [
      { velocityShipmentId: { $exists: true, $nin: ["", null] } },
      { shipmentId: { $exists: true, $nin: ["", null] } },
    ],
    // Exclude Lorrigo-booked orders (they use the Lorrigo status sync loop).
    $and: [
      {
        $or: [
          { courierProvider: { $exists: false } },
          { courierProvider: null },
          { courierProvider: "velocity" },
        ],
      },
    ],
    isJunk: { $ne: true },
    // Drive off main `status` so we still poll when shipmentStatus already shows a
    // terminal Velocity raw value but the website status has not caught up yet.
    status: { $nin: TERMINAL_STATUS_VALUES },
    shipmentStatus: { $nin: ["reship"] },
  })
    .select(
      "_id orderId awb status shipmentStatus trackingActivities statusHistory velocityOrderId velocityShipmentId shipmentId courierName lastVelocityStatusSyncedAt"
    )
    // Oldest / never-synced first so large fleets rotate fairly across runs.
    .sort({ lastVelocityStatusSyncedAt: 1, updatedAt: 1 })
    .limit(batchSize)
    .lean();

  syncLog("info", "[velocity:status-sync] starting", {
    candidates: orders.length,
    batchSize,
  });

  for (const lean of orders) {
    result.processed++;
    const awb = String(lean.awb ?? "").trim();
    if (!awb) {
      result.skipped++;
      continue;
    }

    try {
      const trackResult = await trackShipment({ awb });

      if (!trackResult.status || !String(trackResult.status).trim()) {
        result.errors++;
        const emptyMsg = `${lean.orderId}: empty status from Velocity for awb=${awb}`;
        syncLog("warn", "[velocity:status-sync] empty tracking status", {
          orderId: lean.orderId,
          awb,
        });
        if ((result.errorDetails?.length ?? 0) < 10) {
          result.errorDetails = [...(result.errorDetails ?? []), emptyMsg];
        }
        // Still stamp sync time so one bad AWB does not block the rotation forever.
        await Order.updateOne(
          { _id: lean._id },
          { $set: { lastVelocityStatusSyncedAt: new Date() } }
        );
        continue;
      }

      // internalStatus is the hyphenated value from mapVelocityStatus (e.g. "in-transit")
      const internalStatus = mapVelocityStatus(trackResult.status);
      // internalCanonical is the DB-canonical form (e.g. "in_transit") used by tab queries
      const internalCanonical = normalizeOrderStatus(internalStatus);
      const currentStatus = String(lean.status ?? "");

      const doc = await Order.findById(lean._id);
      if (!doc) {
        result.skipped++;
        continue;
      }

      if (doc.isJunk || doc.status === "reship" || doc.shipmentStatus === "reship") {
        markSynced(doc);
        await doc.save();
        result.skipped++;
        continue;
      }

      let changed = false;

      // Always persist the raw Velocity status so it can be displayed in the UI
      if (doc.shipmentStatus !== trackResult.status && trackResult.status) {
        doc.shipmentStatus = trackResult.status;
        changed = true;
      }

      if (isVelocityCancellationStatus(trackResult.status)) {
        await syncVelocityFailureRemarkByAwb(doc, trackResult, "velocity_bg_sync_cancel").catch(() => false);
        clearShipmentForReship(doc);
        if (doc.status !== "reship") {
          appendHistoryEntry(doc, "reship", "velocity_cancelled_to_reship");
          doc.status = "reship";
        }
        doc.shipmentStatus = "reship";
        markSynced(doc);
        mirrorShopifyFulfillmentStatus(doc);
        await doc.save();
        void pushShopifyFulfillmentUpdate(doc);
        result.updated++;
        syncLog("info", "[velocity:status-sync] moved cancelled Velocity order to reship", {
          orderId: lean.orderId,
          awb,
        });
        continue;
      }

      // Persist tracking activities if available
      if (
        Array.isArray(trackResult.shipment_track_activities) &&
        trackResult.shipment_track_activities.length > 0
      ) {
        doc.trackingActivities = trackResult.shipment_track_activities;
        changed = true;
      }

      // Persist pickup date and compute EDD when courier confirms pickup
      if (trackResult.pickup_date) {
        const pickupMs = Date.parse(trackResult.pickup_date);
        if (!isNaN(pickupMs)) {
          const pickupD = new Date(pickupMs);
          if (!doc.pickupDate || doc.pickupDate.getTime() !== pickupD.getTime()) {
            doc.pickupDate = pickupD;
            changed = true;
          }
        }
      }

      // Velocity's UI Delivery Date is returned by /shipments search under
      // shipment_milestones.original_expected_delivery_date, not by /order-tracking.
      const velocityEdd = await getVelocityDeliveryDateForAwb(awb).catch((eddErr: unknown) => {
        syncLog("warn", "[velocity:status-sync] EDD lookup failed", {
          orderId: lean.orderId,
          awb,
          error: eddErr instanceof Error ? eddErr.message : String(eddErr),
        });
        return undefined;
      });
      if (velocityEdd) {
        const velocityEddMs = Date.parse(velocityEdd);
        if (!isNaN(velocityEddMs)) {
          const velocityEddDate = new Date(velocityEddMs);
          if (!doc.edd || doc.edd.getTime() !== velocityEddDate.getTime()) {
            doc.edd = velocityEddDate;
            changed = true;
          }
        }
      }

      // Advance the main `status` to canonical form so tab queries match.
      // Compare stored value against internalCanonical so we don't keep re-writing
      // e.g. "in_transit" when mapVelocityStatus returns "in-transit".
      if (
        internalStatus &&
        shouldApplyInternalStatusUpdate(currentStatus, internalStatus) &&
        normalizeOrderStatus(doc.status) !== internalCanonical
      ) {
        appendHistoryEntry(doc, internalCanonical, "velocity_bg_sync");
        doc.status = internalCanonical;
        changed = true;
      }

      markSynced(doc);

      if (changed) {
        mirrorShopifyFulfillmentStatus(doc);
        await syncVelocityFailureRemarkByAwb(doc, trackResult, "velocity_bg_sync").catch(() => false);
        await doc.save();
        void pushShopifyFulfillmentUpdate(doc);
        result.updated++;
        syncLog("info", "[velocity:status-sync] updated", {
          orderId: lean.orderId,
          awb,
          from: currentStatus,
          to: internalCanonical,
          velocityRaw: trackResult.status,
        });
      } else {
        await doc.save();
        result.skipped++;
      }

      // When Velocity reports NDR, upsert into NDR Management collection
      if (internalCanonical === "ndr" && trackResult.status) {
        try {
          await upsertNdrFromVelocityShipment(
            {
              attributes: {
                tracking_number: awb,
                status: trackResult.status,
                shipping_address: { name: doc.customer, phone: doc.phone },
                attempt_count: 1,
              },
            },
            doc
          );
        } catch (ndrErr: unknown) {
          syncLog("warn", "[velocity:status-sync] NDR upsert failed", {
            awb,
            error: ndrErr instanceof Error ? ndrErr.message : String(ndrErr),
          });
        }
      }
    } catch (err: unknown) {
      result.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      syncLog("error", "[velocity:status-sync] tracking failed", {
        awb,
        orderId: lean.orderId,
        error: msg,
      });
      if ((result.errorDetails?.length ?? 0) < 10) {
        result.errorDetails = [...(result.errorDetails ?? []), `${lean.orderId}: ${msg}`];
      }
      // Advance sync cursor so a persistently failing AWB does not starve others.
      await Order.updateOne(
        { _id: lean._id },
        { $set: { lastVelocityStatusSyncedAt: new Date() } }
      ).catch(() => undefined);
    }
  }

  syncLog("info", "[velocity:status-sync] done", {
    processed: result.processed,
    updated: result.updated,
    errors: result.errors,
    skipped: result.skipped,
    durationMs: Date.now() - startedAt,
    errorDetails: result.errorDetails?.length ? result.errorDetails : undefined,
  });
  return result;
}
