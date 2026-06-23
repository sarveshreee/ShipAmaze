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
import { trackShipment } from "./velocity.service.js";
import { mapVelocityStatus, shouldApplyInternalStatusUpdate } from "./velocity.mapper.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import { devLog } from "../../utils/devLog.js";

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
];

export interface StatusSyncResult {
  processed: number;
  updated: number;
  errors: number;
  skipped: number;
  /** Sample error messages (up to 5) for surfacing to admin UI. */
  errorDetails?: string[];
}

/**
 * Returns estimated transit days for a courier.
 * Used to compute EDD = pickup_date + transit_days when Velocity does not return EDD directly.
 */
function estimateTransitDays(courierName: string | undefined): number {
  const name = (courierName ?? "").toLowerCase();
  if (name.includes("bluedart")) return 4;
  if (name.includes("delhivery")) return 5;
  if (name.includes("xpressbees")) return 5;
  if (name.includes("shadowfax")) return 5;
  if (name.includes("dtdc")) return 5;
  if (name.includes("ekart")) return 6;
  if (name.includes("amazon")) return 7;
  return 7;
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

      let changed = false;

      // Always persist the raw Velocity status so it can be displayed in the UI
      if (doc.shipmentStatus !== trackResult.status && trackResult.status) {
        doc.shipmentStatus = trackResult.status;
        changed = true;
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
          // Compute EDD = pickup_date + courier transit days (only set if not already populated
          // or the existing EDD is the old order.date+4 fallback which would be earlier than pickup).
          const transitDays = estimateTransitDays(lean.courierName as string | undefined);
          const eddMs = pickupMs + transitDays * 24 * 60 * 60 * 1000;
          const eddD = new Date(eddMs);
          if (!doc.edd || Math.abs(doc.edd.getTime() - eddD.getTime()) > 12 * 60 * 60 * 1000) {
            doc.edd = eddD;
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
        await doc.save();
        result.updated++;
        devLog.info(
          `[velocity:status-sync] updated orderId=${lean.orderId} awb=${awb} ` +
            `${currentStatus} → ${internalCanonical} (velocity raw: ${trackResult.status})`
        );
      } else {
        result.skipped++;
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
