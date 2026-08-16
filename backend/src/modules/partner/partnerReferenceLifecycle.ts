/**
 * Partner reference lifecycle — release external reference after clear booking failure
 * while preserving audit trail on the orphan order document.
 */

import { Order, type IOrder } from "../../models/Order.js";

export function isPartnerOrderSuccessfullyBooked(order: IOrder): boolean {
  return Boolean(order.shipmentCreated) || String(order.awb ?? "").trim().length > 0;
}

export function isPartnerOrderBookingUncertain(order: IOrder): boolean {
  return Boolean(order.bookingReconciliationRequired);
}

/**
 * Clear partnerReferenceId on a failed unbooked order so the partner can reuse the
 * external reference. Archives the original reference on the order for audit.
 */
export async function releasePartnerReferenceAfterFailedBooking(
  order: IOrder,
  reason = "Partner shipment booking failed — reference released for retry"
): Promise<void> {
  if (!order.partnerId) return;
  const activeRef = String(order.partnerReferenceId ?? "").trim();
  if (!activeRef) return;
  if (isPartnerOrderSuccessfullyBooked(order)) return;
  if (isPartnerOrderBookingUncertain(order)) return;

  const archivedRef = activeRef;
  order.partnerReferenceArchived = archivedRef;
  order.partnerReferenceId = undefined;
  order.walletDebitPending = false;

  const prev = order.statusHistory ?? [];
  order.statusHistory = [
    ...prev,
    {
      status: String(order.status ?? "ready_to_ship"),
      at: new Date(),
      note: reason,
    },
  ].slice(-50);

  try {
    await order.save();
  } catch {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          partnerReferenceArchived: archivedRef,
          walletDebitPending: false,
        },
        $unset: { partnerReferenceId: "" },
      }
    ).catch(() => undefined);
  }
}
