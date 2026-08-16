/**
 * Read-only historical financial audit.
 * Detects mismatches; NEVER mutates production data.
 *
 * Usage (from backend package):
 *   npx tsx src/scripts/auditHistoricalFinance.ts [--limit=500] [--shop=domain]
 *
 * Requires MONGO_URI / existing app DB connection env.
 */

import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import { normalizeShopifyOrderPayment } from "../services/normalizeOrderPayment.js";
import { orderCodCollectableAmount } from "../services/normalizeOrderPayment.js";
import { buildOrderFinanceSnapshot } from "../services/orderFinanceReconciliation.js";

export type AuditFinding = {
  orderId: string;
  issue: string;
  current: Record<string, unknown>;
  expected: Record<string, unknown>;
  difference: Record<string, unknown>;
  recommendedAction: string;
};

export async function auditShopifyPaymentClassifications(opts?: {
  limit?: number;
  shopDomain?: string;
}): Promise<AuditFinding[]> {
  const limit = opts?.limit ?? 500;
  const q: Record<string, unknown> = {
    externalSource: "shopify",
    shopifyFinancialStatus: { $in: ["partially_paid", "partially_paid".toUpperCase(), "Partially_paid"] },
  };
  // Also catch case-insensitive via regex
  q.shopifyFinancialStatus = { $regex: /^partially_paid$/i };
  if (opts?.shopDomain) q.shopifyShopDomain = opts.shopDomain.toLowerCase();

  const orders = await Order.find(q).limit(limit).lean();
  const findings: AuditFinding[] = [];

  for (const o of orders) {
    const expected = normalizeShopifyOrderPayment({
      financial_status: String(o.shopifyFinancialStatus ?? ""),
      total_price: o.amount,
      total_outstanding: o.amountOutstanding,
      payment_gateway_names: [],
      tags: o.shopifyTags,
    });
    // If outstanding unknown, recompute from financial status alone
    const expectedCod = expected.codAmount;
    const currentPayment = String(o.payment ?? "");
    const currentCod = orderCodCollectableAmount({
      payment: currentPayment,
      amount: o.amount,
      codCollectableAmount: o.codCollectableAmount,
      amountOutstanding: o.amountOutstanding,
    });

    if (currentPayment === "Prepaid" && expected.payment === "COD") {
      findings.push({
        orderId: o.orderId,
        issue: "partially_paid_classified_as_prepaid",
        current: {
          payment: currentPayment,
          amount: o.amount,
          codCollectableAmount: o.codCollectableAmount,
          shopifyFinancialStatus: o.shopifyFinancialStatus,
        },
        expected: {
          payment: "COD",
          amountPaid: expected.amountPaid,
          codCollectableAmount: expectedCod,
        },
        difference: {
          payment: `${currentPayment} → COD`,
          codCollectableAmount: `${currentCod} → ${expectedCod}`,
        },
        recommendedAction:
          "Re-sync Shopify order (or run controlled migration) to set payment=COD and codCollectableAmount from total_outstanding.",
      });
    } else if (currentPayment === "COD" && expectedCod > 0 && Math.abs(currentCod - expectedCod) > 0.01) {
      findings.push({
        orderId: o.orderId,
        issue: "incorrect_cod_collectable_amount",
        current: { codCollectableAmount: currentCod, amount: o.amount },
        expected: { codCollectableAmount: expectedCod },
        difference: { codCollectableAmount: currentCod - expectedCod },
        recommendedAction: "Update codCollectableAmount to outstanding remainder; do not change delivered remittance without review.",
      });
    }
  }

  return findings;
}

/** COD orders where remittance-style full amount would overstate vs collectable. */
export async function auditCodAmountVsCollectable(opts?: { limit?: number }): Promise<AuditFinding[]> {
  const limit = opts?.limit ?? 500;
  const orders = await Order.find({
    payment: /^cod$/i,
    codCollectableAmount: { $gt: 0 },
    $expr: { $gt: ["$amount", "$codCollectableAmount"] },
  })
    .limit(limit)
    .lean();

  return orders.map((o) => {
    const snap = buildOrderFinanceSnapshot(o as Record<string, unknown>);
    return {
      orderId: o.orderId,
      issue: "full_amount_exceeds_collectable",
      current: { amount: o.amount, codCollectableAmount: o.codCollectableAmount },
      expected: { remittanceShouldUse: snap.codAmount },
      difference: { overstatedBy: Number(o.amount) - snap.codAmount },
      recommendedAction:
        "Ensure remittance sync uses orderCodCollectableAmount (already wired). Re-run remittance sync after deploy; do not rewrite historical CodRemittance rows without finance approval.",
    };
  });
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI to run this audit.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 500;
  const shopArg = process.argv.find((a) => a.startsWith("--shop="));
  const shop = shopArg ? shopArg.split("=")[1] : undefined;

  const partial = await auditShopifyPaymentClassifications({ limit, shopDomain: shop });
  const amounts = await auditCodAmountVsCollectable({ limit });

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    counts: {
      partiallyPaidMisclassified: partial.length,
      fullAmountExceedsCollectable: amounts.length,
    },
    findings: [...partial, ...amounts],
  };
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].includes("auditHistoricalFinance") || process.argv[1].endsWith("auditHistoricalFinance.ts"));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
