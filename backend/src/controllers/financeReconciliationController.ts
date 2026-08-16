/**
 * Read-only order finance reconciliation API.
 * Does NOT mutate data.
 */

import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Order } from "../models/Order.js";
import { Transaction } from "../models/Transaction.js";
import { CodRemittance } from "../models/CodRemittance.js";
import { buildOrderFinanceSnapshot } from "../services/orderFinanceReconciliation.js";
import { COD_METRIC_DEFINITIONS } from "../services/codMetrics.js";
import { buildOrderVisibilityQuery } from "../utils/orderFilters.js";

export const getOrderFinanceSnapshot = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const orderId = String(req.params.orderId ?? "").trim();
  if (!orderId) throw new AppError(400, "orderId is required");

  const visibility = await buildOrderVisibilityQuery(req.user);
  const order = await Order.findOne({ orderId, ...visibility }).lean();
  if (!order) throw new AppError(404, "Order not found");

  const snapshot = buildOrderFinanceSnapshot(order as Record<string, unknown>);

  const walletDebits = await Transaction.find({
    referenceType: "shipment",
    referenceId: `shipment:${order.orderId}`,
  })
    .select("txnId type amount balanceBefore balance balanceAfter ledgerType createdAt userId")
    .lean();

  const remittances = await CodRemittance.find({
    userId: order.ownerUserId ?? order.dropshipperId ?? order.createdBy,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("remittanceId status codAmount netPayable deductions weekKey settleDate userId")
    .lean();

  res.json({
    success: true,
    data: {
      snapshot,
      walletDebits,
      remittances,
      metricDefinitions: COD_METRIC_DEFINITIONS,
      readOnly: true,
    },
  });
});

export const getCodMetricDefinitions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: COD_METRIC_DEFINITIONS });
});
