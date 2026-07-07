/**
 * Velocity Shipping – bulk shipment status sync.
 *
 * Fetches every active order that has an AWB but a stale "in-progress" shipment
 * status, calls the Velocity tracking API for each, and persists the result.
 *
 * Designed to be called:
 *   • From the background interval in server.ts (every ~10 minutes).
 *   • From the admin API endpoint POST /velocity/sync-statuses (on-demand).
 */

import { Order } from "../../models/Order.js";
import { listShipments, trackShipment } from "./velocity.service.js";
import { mapVelocityStatus, shouldApplyInternalStatusUpdate } from "./velocity.mapper.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import { devLog } from "../../utils/devLog.js";
import { mirrorShopifyFulfillmentStatus, pushShopifyFulfillmentUpdate } from "../../services/shopifyFulfillmentMirror.js";
import { upsertNdrFromVelocityShipment } from "./velocity.ndrSync.js";
import { syncVelocityFailureRemarkByAwb } from "./velocityRemarkSync.js";

/** Shipment statuses that need live tracking refreshed from Velocity. */
const STALE_STATUSES = [
  // hyphenated (legacy stored values)
  "pending-pickup",
  "pickup-scheduled",
  "picked-up",
  "in-transit",
  "out-for-delivery",
  // underscore canonical
  "pending_pickup",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  // Velocity raw strings that may have been stored directly
  "In Transit",
  "In-Transit",
  "In transit",
  "Pickup Scheduled",
  "Picked Up",
  "Out for Delivery",
  "Out For Delivery",
  "ready_to_ship",
  "ready-to-ship",
  "ready_for_pickup",
  "Ready for Pickup",
  "not_picked",
  "Not Picked",
];

export interface StatusSyncResult {
  processed: number;
  updated: number;
  errors: number;
  skipped: number;
  /** Sample error messages (up to 5) for surfacing to admin UI. */
  errorDetails?: string[];
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

/**
 * Refresh all active orders whose `shipmentStatus` (or `status`) indicates
 * they are somewhere between Pickup Scheduled and Out for Delivery.
 *
 * @param batchSize - max orders to process per call (default 100 to avoid timeouts)
 */
export async function syncActiveShipmentStatuses(
  batchSize = 100
): Promise<StatusSyncResult> {
  const result: StatusSyncResult = { processed: 0, updated: 0, errors: 0, skipped: 0, errorDetails: [] };

  const orders = await Order.find({
    awb: { $exists: true, $nin: ["", null] },
    // Only track orders that were actually submitted through Velocity — placeholder
    // AWBs (e.g. "AWB-{timestamp}-{random}") have no velocityShipmentId and
    // Velocity will return 400 "Shipment not found" for them.
    velocityShipmentId: { $exists: true, $nin: ["", null] },
    isJunk: { $ne: true },
    status: { $nin: ["reship", "junk", "cancelled"] },
    shipmentStatus: { $nin: ["reship", "cancelled"] },
    $or: [
      { shipmentStatus: { $in: STALE_STATUSES } },
      { status: { $in: STALE_STATUSES } },
    ],
  })
    .select("_id orderId awb status shipmentStatus trackingActivities statusHistory velocityOrderId velocityShipmentId courierName")
    .limit(batchSize)
    .lean();

  devLog.info(`[velocity:status-sync] ${orders.length} orders to refresh`);

  for (const lean of orders) {
    result.processed++;
    const awb = String(lean.awb ?? "").trim();
    if (!awb) {
      result.skipped++;
      continue;
    }

    try {
      const trackResult = await trackShipment({ awb });

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
        mirrorShopifyFulfillmentStatus(doc);
        await doc.save();
        void pushShopifyFulfillmentUpdate(doc);
        result.updated++;
        devLog.info(
          `[velocity:status-sync] moved cancelled Velocity order to reship orderId=${lean.orderId} awb=${awb}`
        );
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
      const velocityEdd = await getVelocityDeliveryDateForAwb(awb).catch(() => undefined);
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
        doc.status !== internalCanonical
      ) {
        appendHistoryEntry(doc, internalCanonical, "velocity_bg_sync");
        doc.status = internalCanonical;
        changed = true;
      }

      if (changed) {
        mirrorShopifyFulfillmentStatus(doc);
        await syncVelocityFailureRemarkByAwb(doc, trackResult, "velocity_bg_sync").catch(() => false);
        await doc.save();
        void pushShopifyFulfillmentUpdate(doc);
        result.updated++;
        devLog.info(
          `[velocity:status-sync] updated orderId=${lean.orderId} awb=${awb} ` +
            `${currentStatus} → ${internalCanonical} (velocity raw: ${trackResult.status})`
        );
      } else {
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
          devLog.warn(
            `[velocity:status-sync] NDR upsert failed awb=${awb}:`,
            ndrErr instanceof Error ? ndrErr.message : ndrErr
          );
        }
      }
    } catch (err: unknown) {
      result.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      devLog.warn(
        `[velocity:status-sync] tracking failed awb=${awb} orderId=${lean.orderId}: ${msg}`
      );
      if ((result.errorDetails?.length ?? 0) < 5) {
        result.errorDetails = [...(result.errorDetails ?? []), `${lean.orderId}: ${msg}`];
      }
    }
  }

  devLog.info(
    `[velocity:status-sync] done — processed=${result.processed} updated=${result.updated} errors=${result.errors} skipped=${result.skipped}`
  );
  return result;
}
