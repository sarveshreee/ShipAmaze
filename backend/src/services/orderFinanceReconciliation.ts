/**
 * Diagnostic reconciliation helper — prints canonical financial state for an order.
 * Use from scripts / admin tools; does not mutate data.
 */

import { orderCodCollectableAmount } from "./normalizeOrderPayment.js";

export type OrderFinanceSnapshot = {
  orderId: string;
  orderTotal: number;
  amountPaid: number;
  amountOutstanding: number;
  payment: string;
  paymentMethod: string;
  isPartiallyPaid: boolean;
  codAmount: number;
  shippingCharges: number;
  codCharges: number;
  rtoCharges: number;
  gstHint: number;
  walletDebitPending: boolean;
  remittanceNetHint: number;
  reason?: string;
};

export function buildOrderFinanceSnapshot(order: Record<string, unknown>): OrderFinanceSnapshot {
  const orderTotal = Number(order.amount ?? 0) || 0;
  const amountPaid = Number(order.amountPaid ?? 0) || 0;
  const amountOutstanding = Number(order.amountOutstanding ?? 0) || 0;
  const payment = String(order.payment ?? "");
  const codAmount = orderCodCollectableAmount({
    payment,
    amount: orderTotal,
    codCollectableAmount: order.codCollectableAmount as number | undefined,
    amountOutstanding,
  });
  const shippingCharges = Number(order.shippingCharges ?? 0) || 0;
  const codCharges = Number(order.codCharges ?? 0) || 0;
  const rtoCharges = Number(order.rtoCharges ?? 0) || 0;
  const gstPct = 18;
  const taxable = orderTotal / (1 + gstPct / 100);
  const gstHint = Math.round((orderTotal - taxable) * 100) / 100;
  return {
    orderId: String(order.orderId ?? order.id ?? ""),
    orderTotal,
    amountPaid,
    amountOutstanding,
    payment,
    paymentMethod: payment,
    isPartiallyPaid: Boolean(order.isPartiallyPaid),
    codAmount,
    shippingCharges,
    codCharges,
    rtoCharges,
    gstHint,
    walletDebitPending: Boolean(order.walletDebitPending),
    remittanceNetHint: Math.round((codAmount - shippingCharges - codCharges - rtoCharges) * 100) / 100,
    reason: order.paymentNormalizationReason ? String(order.paymentNormalizationReason) : undefined,
  };
}
