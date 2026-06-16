import type { ProfitCalculatorResult } from "@/types/profitCalculator";

export type ProfitCalculatorInput = {
  sellingPrice: number;
  expectedOrders: number;
  confirmPct: number;
  deliveryPct: number;
  adSpendPerOrder: number;
  misc: number;
  unitCost: number;
  rtoChargePerOrder: number;
  shippingChargePerOrder: number;
};

/** Dropshipping P&L: revenue on delivered; sourcing + forward ship on confirmed; RTO fee on returns. */
export function computeProfitCalculator(input: ProfitCalculatorInput): ProfitCalculatorResult | null {
  const {
    sellingPrice,
    expectedOrders,
    confirmPct,
    deliveryPct,
    adSpendPerOrder,
    misc,
    unitCost,
    rtoChargePerOrder,
    shippingChargePerOrder,
  } = input;

  if (expectedOrders <= 0) return null;
  if (confirmPct < 0 || confirmPct > 100 || deliveryPct < 0 || deliveryPct > 100) return null;

  const confirmed = Math.round(expectedOrders * (confirmPct / 100));
  const delivered = Math.round(confirmed * (deliveryPct / 100));
  const returnsNotDelivered = Math.max(0, confirmed - delivered);
  /** When RTO fee is ₹0, returns are not modeled in the calculator funnel. */
  const rto = rtoChargePerOrder > 0 ? returnsNotDelivered : 0;

  const revenue = delivered * sellingPrice;
  const sourcingCost = confirmed * unitCost;
  const shippingCost = confirmed * shippingChargePerOrder;
  const rtoCost = rto * rtoChargePerOrder;
  const adCost = expectedOrders * adSpendPerOrder;
  const miscCost = misc;
  const totalSpend = sourcingCost + shippingCost + rtoCost + adCost + miscCost;
  const netProfit = revenue - totalSpend;
  const netPerDelivered = delivered > 0 ? netProfit / delivered : 0;

  return {
    expectedOrders,
    confirmed,
    delivered,
    rto,
    revenue,
    sourcingCost,
    shippingCost,
    rtoCost,
    adCost,
    miscCost,
    totalSpend,
    netProfit,
    netPerDelivered,
  };
}
