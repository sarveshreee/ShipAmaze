/**
 * Canonical COD metric definitions for ShipAmaze finance surfaces.
 *
 * These metrics are INTENTIONALLY different — do not merge them into one number.
 *
 * ┌──────────────────────────────┬────────────────────────────────────────────────────────────┐
 * │ Metric                       │ Definition                                                 │
 * ├──────────────────────────────┼────────────────────────────────────────────────────────────┤
 * │ dashboardUndeliveredCODAmount│ Sum of collectable COD on COD orders that are NOT yet     │
 * │                              │ delivered (pipeline / still with courier). Prefer           │
 * │                              │ order.codCollectableAmount, else amountOutstanding,       │
 * │                              │ else order.amount.                                         │
 * ├──────────────────────────────┼────────────────────────────────────────────────────────────┤
 * │ walletPendingRemittanceAmount│ Sum of CodRemittance.netPayable where status ∈            │
 * │                              │ Pending | Processing | On Hold (settlement backlog).       │
 * ├──────────────────────────────┼────────────────────────────────────────────────────────────┤
 * │ remittancePendingAmount      │ Same source as walletPendingRemittanceAmount for a user;  │
 * │                              │ exposed on remittance list aggregates.                     │
 * ├──────────────────────────────┼────────────────────────────────────────────────────────────┤
 * │ payoutPendingAmount          │ Alias of walletPendingRemittanceAmount on payout UIs      │
 * │                              │ (VendorPayouts "Next COD").                                │
 * └──────────────────────────────┴────────────────────────────────────────────────────────────┘
 *
 * API field names (canonical + backward-compat aliases):
 * - Dashboard summary: `dashboardUndeliveredCODAmount` (+ deprecated `codPendingAmount`)
 * - Wallet summary:    `walletPendingRemittanceAmount` (+ deprecated `pendingCod`)
 */

import { orderCodCollectableAmount } from "./normalizeOrderPayment.js";

export const COD_METRIC_DEFINITIONS = {
  dashboardUndeliveredCODAmount: {
    apiField: "dashboardUndeliveredCODAmount",
    legacyApiField: "codPendingAmount",
    uiLabel: "Undelivered COD (pipeline)",
    description:
      "Sum of collectable COD amounts for COD orders that are not yet delivered. " +
      "Measures cash still expected from customers via courier, not remittance settlement.",
  },
  walletPendingRemittanceAmount: {
    apiField: "walletPendingRemittanceAmount",
    legacyApiField: "pendingCod",
    uiLabel: "Pending remittance",
    description:
      "Sum of CodRemittance.netPayable for remittances in Pending, Processing, or On Hold. " +
      "Measures COD settlement backlog due to the merchant, after delivery.",
  },
  remittancePendingAmount: {
    apiField: "remittancePendingAmount",
    legacyApiField: "pendingCod",
    uiLabel: "Remittance pending",
    description: "Same settlement backlog as walletPendingRemittanceAmount, scoped to remittance views.",
  },
  payoutPendingAmount: {
    apiField: "payoutPendingAmount",
    legacyApiField: "pendingCod",
    uiLabel: "Next COD payout",
    description: "Payout UI alias of walletPendingRemittanceAmount (upcoming settlement).",
  },
} as const;

/**
 * Mongo expression aligned with orderCodCollectableAmount:
 * codCollectableAmount → amountOutstanding → amount.
 */
export function mongoCodCollectableExpr(): Record<string, unknown> {
  return {
    $cond: [
      { $gt: [{ $ifNull: ["$codCollectableAmount", 0] }, 0] },
      { $ifNull: ["$codCollectableAmount", 0] },
      {
        $cond: [
          { $gt: [{ $ifNull: ["$amountOutstanding", 0] }, 0] },
          { $ifNull: ["$amountOutstanding", 0] },
          { $ifNull: ["$amount", 0] },
        ],
      },
    ],
  };
}

/** In-process collectable for a lean order row. */
export function collectableFromOrderRow(order: {
  payment?: string | null;
  amount?: number | null;
  codCollectableAmount?: number | null;
  amountOutstanding?: number | null;
}): number {
  return orderCodCollectableAmount(order);
}
