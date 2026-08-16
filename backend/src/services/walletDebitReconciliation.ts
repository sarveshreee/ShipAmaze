/**
 * Reconcile pending wallet debits after successful provider bookings.
 * Uses existing idempotent debitShipmentChargeIfApplicable (shipment:{orderId}).
 */

import { Order, type IOrder } from "../models/Order.js";
import { isPartnerWalletBillingEnabled } from "../modules/partner/partnerConfig.js";
import {
  attemptAndTrackShipmentWalletDebit,
  markShipmentWalletDebitPending,
} from "./shipmentWallet.js";
import { orderShouldDebitWallet } from "./walletLedger.js";

export type WalletDebitReconcileResult = {
  scanned: number;
  debited: number;
  stillPending: number;
  cleared: number;
};

/**
 * Process orders marked walletDebitPending when AWB/shipment exists.
 * No-op when PARTNER_WALLET_BILLING_ENABLED is false.
 */
export async function reconcilePendingWalletDebits(
  batchSize = 50
): Promise<WalletDebitReconcileResult> {
  if (!isPartnerWalletBillingEnabled()) {
    return { scanned: 0, debited: 0, stillPending: 0, cleared: 0 };
  }

  const orders = await Order.find({
    walletDebitPending: true,
    dropshipperId: { $exists: true, $ne: null },
  })
    .sort({ walletDebitFailedAt: 1, updatedAt: 1 })
    .limit(batchSize);

  let debited = 0;
  let stillPending = 0;
  let cleared = 0;

  for (const order of orders) {
    if (!orderShouldDebitWallet(order)) {
      order.walletDebitPending = false;
      await order.save().catch(() => undefined);
      cleared++;
      continue;
    }

    const awb = String(order.awb ?? "").trim();
    const booked = Boolean(order.shipmentCreated) || awb.length > 0;
    if (!booked) {
      stillPending++;
      continue;
    }

    const r = await attemptAndTrackShipmentWalletDebit(order, undefined, {
      partnerId: String(order.partnerId ?? ""),
      provider: String(order.courierProvider ?? ""),
    });

    if (r.applied || r.reason === "duplicate") {
      debited++;
    } else if (order.walletDebitPending) {
      stillPending++;
    } else {
      cleared++;
    }
  }

  return { scanned: orders.length, debited, stillPending, cleared };
}

/**
 * When status sync discovers AWB on a partner order awaiting debit, mark pending.
 */
export async function markWalletDebitPendingIfBookedWithoutDebit(order: IOrder): Promise<void> {
  if (!isPartnerWalletBillingEnabled()) return;
  if (!orderShouldDebitWallet(order)) return;
  if (!order.partnerId) return;

  const awb = String(order.awb ?? "").trim();
  const booked = Boolean(order.shipmentCreated) || awb.length > 0;
  if (!booked) return;
  if (!order.walletDebitPending) {
    markShipmentWalletDebitPending(order, "awaiting_wallet_debit");
    await order.save().catch(() => undefined);
  }
}
