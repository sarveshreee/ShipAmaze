/**
 * Shared shipment wallet precheck/debit — mirrors Velocity forward-shipment wallet behavior
 * for non-Velocity booking paths (e.g. Partner API Lorrigo/Ekart).
 */

import type { IOrder } from "../models/Order.js";
import { resolveBillableShippingCharge } from "./billableShippingCharge.js";
import {
  assertWalletBalanceAtLeast,
  debitShipmentChargeIfApplicable,
  orderWalletUserId,
  orderShouldDebitWallet,
} from "./walletLedger.js";
import { Order } from "../models/Order.js";

export type ShipmentWalletDebitResult =
  | { applied: true; amount: number; txnId: string; balanceAfter: number }
  | {
      applied: false;
      reason:
        | "no_billable_user"
        | "zero_amount"
        | "duplicate"
        | "insufficient"
        | "not_dropshipper_order"
        | "debit_failed";
    };

function parseWeightKg(order: IOrder): number | undefined {
  const w = parseFloat(String(order.weight ?? ""));
  return Number.isFinite(w) && w > 0 ? w : undefined;
}

function estimateShipmentCharge(order: IOrder): number | null {
  const fromOrder = Number(order.shippingCharges);
  if (Number.isFinite(fromOrder) && fromOrder > 0) return fromOrder;
  return null;
}

async function persistWalletDebitState(order: IOrder): Promise<void> {
  try {
    await order.save();
  } catch {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          walletDebitPending: order.walletDebitPending ?? false,
          walletDebitFailedAt: order.walletDebitFailedAt,
        },
      }
    ).catch(() => undefined);
  }
}

/**
 * Precheck wallet balance before calling a courier provider.
 * No-op when order is not wallet-billable.
 */
export async function precheckOrderShipmentWallet(order: IOrder): Promise<void> {
  if (!orderShouldDebitWallet(order)) return;
  const uid = orderWalletUserId(order);
  if (!uid) return;

  const billable = await resolveBillableShippingCharge({
    order,
    courierName: String(order.courierName ?? order.courier ?? ""),
    weightKg: parseWeightKg(order),
  });

  const est = billable?.total ?? estimateShipmentCharge(order);
  if (est == null || !(est > 0)) return;

  await assertWalletBalanceAtLeast(uid, est);
}

/**
 * Debit wallet once after a confirmed successful booking.
 * Idempotent via debitShipmentChargeIfApplicable (shipment:{orderId}).
 * Logs and returns debit_failed on unexpected errors — does not throw (shipment stays booked).
 */
export async function debitOrderShipmentAfterBooking(
  order: IOrder,
  providerFreightFallback?: number
): Promise<ShipmentWalletDebitResult> {
  const chargeFromOrder = estimateShipmentCharge(order);
  const fallback = Number(providerFreightFallback);
  const shippingCharges =
    chargeFromOrder != null
      ? chargeFromOrder
      : Number.isFinite(fallback) && fallback > 0
        ? fallback
        : undefined;

  try {
    const r = await debitShipmentChargeIfApplicable({
      order,
      shippingCharges,
    });
    if (r.applied) {
      return {
        applied: true,
        amount: r.amount,
        txnId: r.txnId,
        balanceAfter: r.balanceAfter,
      };
    }
    return { applied: false, reason: r.reason };
  } catch (err) {
    console.warn(
      `[shipment-wallet] Wallet debit failed after shipment create for ${order.orderId}:`,
      err instanceof Error ? err.message : err
    );
    return { applied: false, reason: "debit_failed" };
  }
}

/** Mark order for wallet debit reconciliation (e.g. awaiting AWB or debit retry). */
export function markShipmentWalletDebitPending(order: IOrder, reason: string): void {
  if (!orderShouldDebitWallet(order)) return;
  order.walletDebitPending = true;
  order.walletDebitFailedAt = new Date();
  console.warn(
    `[shipment-wallet] WALLET_DEBIT_PENDING orderId=${order.orderId} partnerId=${String(order.partnerId ?? "-")} provider=${String(order.courierProvider ?? "-")} reason=${reason}`
  );
}

/**
 * Attempt wallet debit and persist walletDebitPending / cleared state for reconciliation.
 */
export async function attemptAndTrackShipmentWalletDebit(
  order: IOrder,
  providerFreightFallback?: number,
  opts?: { partnerId?: string; provider?: string }
): Promise<ShipmentWalletDebitResult> {
  const r = await debitOrderShipmentAfterBooking(order, providerFreightFallback);

  if (!orderShouldDebitWallet(order)) {
    order.walletDebitPending = false;
    await persistWalletDebitState(order);
    return r;
  }

  if (r.applied || r.reason === "duplicate") {
    order.walletDebitPending = false;
    order.walletDebitFailedAt = undefined;
    await persistWalletDebitState(order);
    return r;
  }

  if (r.reason === "not_dropshipper_order" || r.reason === "no_billable_user") {
    order.walletDebitPending = false;
    await persistWalletDebitState(order);
    return r;
  }

  order.walletDebitPending = true;
  order.walletDebitFailedAt = new Date();
  console.warn(
    `[shipment-wallet] WALLET_DEBIT_PENDING orderId=${order.orderId} partnerId=${opts?.partnerId ?? String(order.partnerId ?? "-")} provider=${opts?.provider ?? String(order.courierProvider ?? "-")} reason=${r.reason}`
  );
  await persistWalletDebitState(order);
  return r;
}
