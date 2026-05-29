/**
 * =============================================================================
 * DO NOT RUN IN PRODUCTION WITHOUT A FULL MONGODB BACKUP
 * =============================================================================
 *
 * Removes demo / test / fake orders and related operational data from MongoDB.
 *
 * PRESERVES: users, vendors, dropshippers, warehouses, pickups (addresses),
 * couriers, Shopify store connections, label-invoice settings, products, etc.
 *
 * Usage:
 *   npm run clear:test-orders              # interactive confirm
 *   npm run clear:test-orders -- --dry-run # preview only
 *   DRY_RUN=1 npm run clear:test-orders    # preview (env alias)
 *
 * Optional env:
 *   CLEAR_TEST_EXTRA_ORDER_IDS=ORD-1,ORD-2  # force-include orderIds
 *   CLEAR_TEST_SHOP_DOMAINS=test.myshopify.com,demo-store.myshopify.com
 *
 * WARNING: Deleting wallet transactions does NOT recalculate Wallet.balance.
 * Reconcile wallets manually after cleanup if shipment debits were removed.
 */

import "dotenv/config";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import mongoose, { type FilterQuery } from "mongoose";
import { connectDb, disconnectDb } from "../config/db.js";
import { redactMongoUri } from "../config/env.js";
import { Order, type IOrder } from "../models/Order.js";
import { OrderSkuAudit } from "../models/OrderSkuAudit.js";
import { WeightDispute } from "../models/WeightDispute.js";
import { NDR } from "../models/NDR.js";
import { ReturnOrder } from "../models/ReturnOrder.js";
import { Notification } from "../models/Notification.js";
import { Transaction } from "../models/Transaction.js";
import { Manifest } from "../models/Manifest.js";
import { Invoice } from "../models/Invoice.js";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const dryRun =
  args.has("--dry-run") ||
  args.has("-n") ||
  process.env.DRY_RUN === "1" ||
  process.env.DRY_RUN === "true";
const deleteAllOrders = args.has("--all-orders");
const includeTestManifests = args.has("--include-test-manifests");
const includeTestInvoices = args.has("--include-test-invoices");
const skipConfirm = args.has("--yes") && process.env.CLEAR_TEST_ORDERS_CONFIRM === "YES";

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------

const TEST_TOKEN =
  /\b(test|testing|demo|dummy|sample|fake|mock|placeholder|lorem|shopify\s*customer)\b/i;

function testEmail(email: string | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (/^(test|demo|dummy|sample|fake)/.test(e)) return true;
  if (/@(example\.(com|test|org)|test\.com|mailinator\.com|yopmail\.com)$/.test(e)) return true;
  if (/test@|demo@|dummy@/.test(e)) return true;
  return false;
}

function testShopDomain(domain: string | undefined): boolean {
  const d = String(domain ?? "").trim().toLowerCase();
  if (!d) return false;
  if (/test|demo|dummy|sample|dev|staging|sandbox/.test(d)) return true;
  const extra = (process.env.CLEAR_TEST_SHOP_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.some((x) => d === x || d.endsWith(`.${x}`));
}

function lineItemsLookTest(order: Record<string, unknown>): boolean {
  const arrays = [order.products, order.items, order.orderItems, order.shopifyLineItems];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const sku = String(o.sku ?? o.SKU ?? o.productCode ?? "").toUpperCase();
      const name = String(o.name ?? o.title ?? o.productName ?? "");
      if (/^(TEST|DEMO|SAMPLE|DUMMY|SKU-TEST)/.test(sku)) return true;
      if (TEST_TOKEN.test(name)) return true;
    }
  }
  return false;
}

function stubTrackingFields(order: Record<string, unknown>): boolean {
  const awb = String(order.awb ?? "");
  const shipmentId = String(order.shipmentId ?? "");
  const trackingId = String(order.trackingId ?? "");
  // Admin stub shipment flow (disabled in prod) used SHP-* / TRK-* patterns
  if (/^TRK-/i.test(awb) || /^TRK-/i.test(trackingId)) return true;
  if (/^SHP-/i.test(shipmentId) && /^TRK-/i.test(trackingId)) return true;
  return false;
}

/** Exported for unit tests */
export function orderLooksLikeTest(order: Record<string, unknown>, opts?: { all?: boolean }): boolean {
  if (opts?.all) return true;

  const orderId = String(order.orderId ?? "");
  const customer = String(order.customer ?? "");
  const phone = String(order.phone ?? order.customerPhone ?? "");
  const address = String(order.address ?? order.shippingAddress1 ?? "");

  if (/^T-\d+/i.test(orderId)) return true;
  if (/^(TEST|DEMO|SAMPLE|DUMMY|FAKE)-/i.test(orderId)) return true;
  if (/test|demo|sample|dummy|fake/i.test(orderId)) return true;

  const extraIds = (process.env.CLEAR_TEST_EXTRA_ORDER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (extraIds.includes(orderId)) return true;

  if (TEST_TOKEN.test(customer)) return true;
  if (testEmail(String(order.customerEmail ?? ""))) return true;
  if (testShopDomain(String(order.shopifyShopDomain ?? ""))) return true;
  if (stubTrackingFields(order)) return true;
  if (lineItemsLookTest(order)) return true;

  if (TEST_TOKEN.test(String(order.externalOrderName ?? ""))) return true;
  if (TEST_TOKEN.test(String(order.shopifyNote ?? ""))) return true;
  if (TEST_TOKEN.test(String(order.shopifyTags ?? ""))) return true;
  if (TEST_TOKEN.test(String(order.junkReason ?? ""))) return true;

  if (TEST_TOKEN.test(address) && phone.replace(/\D/g, "").length <= 6) return true;

  // Obvious integration-test style phones
  if (/^(\+91)?[6-9]0{9,}$/.test(phone.replace(/\s/g, ""))) return true;

  return false;
}

/** Mongo pre-filter — superset of obvious SQL-like matches (refined in JS). */
export function buildTestOrderMongoFilter(): FilterQuery<IOrder> {
  return {
    $or: [
      { orderId: /^T-/i },
      { orderId: /test|demo|sample|dummy|fake/i },
      { customer: /shopify\s*customer|test|demo|dummy|sample/i },
      { customerEmail: /test|demo|dummy|example\.(com|test)/i },
      { awb: /^TRK-/i },
      { trackingId: /^TRK-/i },
      { shipmentId: /^SHP-/i },
      { shopifyShopDomain: /test|demo|dummy|dev|staging|sandbox/i },
      { externalOrderName: /test|demo|sample/i },
      { shopifyTags: /test|demo/i },
      { junkReason: /test|demo/i },
    ],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type DeleteCounts = Record<string, number>;

async function promptConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(message);
  rl.close();
  return answer.trim() === "DELETE TEST ORDERS";
}

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error("[clear-test-orders] MONGODB_URI is not set.");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && !dryRun) {
    console.warn(
      "\n*** WARNING: NODE_ENV=production. Take a MongoDB backup before proceeding. ***\n"
    );
  }

  console.log(`[clear-test-orders] Connecting to ${redactMongoUri(uri)}`);
  await connectDb(uri);

  const totalOrders = await Order.countDocuments();
  console.log(`[clear-test-orders] Total orders in database: ${totalOrders}`);

  let candidates: Record<string, unknown>[];

  if (deleteAllOrders) {
    console.warn("[clear-test-orders] --all-orders: EVERY order will be selected.");
    candidates = await Order.find({}).lean();
  } else {
    const mongoHits = await Order.find(buildTestOrderMongoFilter()).lean();
    const hitIds = new Set(mongoHits.map((o) => String(o.orderId)));
    const refined = mongoHits.filter((o) => orderLooksLikeTest(o as Record<string, unknown>));

    // Second pass: scan remaining orders for line-item-only heuristics (slower)
    const remaining = await Order.find({ orderId: { $nin: [...hitIds] } })
      .select(
        "orderId customer customerEmail phone address products items orderItems shopifyLineItems shopifyShopDomain awb shipmentId trackingId externalOrderName shopifyNote shopifyTags junkReason"
      )
      .lean();
    const extra = remaining.filter((o) => orderLooksLikeTest(o as Record<string, unknown>));
    candidates = [...refined, ...extra];
  }

  const orderIds = [...new Set(candidates.map((o) => String(o.orderId)).filter(Boolean))];
  const awbs = [
    ...new Set(
      candidates.map((o) => String(o.awb ?? "").trim()).filter((a) => a.length > 0)
    ),
  ];

  console.log("\n--- Preview: orders to remove ---");
  console.log(`Matched orders: ${orderIds.length}`);
  const preview = orderIds.slice(0, 25);
  for (const id of preview) {
    const o = candidates.find((c) => String(c.orderId) === id);
    console.log(
      `  - ${id} | customer=${String(o?.customer ?? "").slice(0, 40)} | awb=${String(o?.awb ?? "")}`
    );
  }
  if (orderIds.length > preview.length) {
    console.log(`  ... and ${orderIds.length - preview.length} more`);
  }

  const shipmentRefIds = orderIds.map((id) => `shipment:${id}`);

  const relatedCounts = {
    orderSkuAudits: await OrderSkuAudit.countDocuments({ orderId: { $in: orderIds } }),
    weightDisputesByOrder: await WeightDispute.countDocuments({ orderId: { $in: orderIds } }),
    weightDisputesByAwb:
      awbs.length > 0
        ? await WeightDispute.countDocuments({ awb: { $in: awbs }, orderId: { $nin: orderIds } })
        : 0,
    ndrByAwb: awbs.length > 0 ? await NDR.countDocuments({ awb: { $in: awbs } }) : 0,
    returnsByOrder: await ReturnOrder.countDocuments({ originalOrderId: { $in: orderIds } }),
    returnsByAwb:
      awbs.length > 0
        ? await ReturnOrder.countDocuments({ awb: { $in: awbs }, originalOrderId: { $nin: orderIds } })
        : 0,
    notifications: await Notification.countDocuments({ "meta.orderId": { $in: orderIds } }),
    transactions: await Transaction.countDocuments({
      $or: [
        { referenceType: "shipment", referenceId: { $in: shipmentRefIds } },
        { referenceType: "order", referenceId: { $in: orderIds } },
        { referenceId: { $in: orderIds } },
        { referenceId: { $in: shipmentRefIds } },
      ],
    }),
    manifests: includeTestManifests
      ? await Manifest.countDocuments({
          $or: [{ manifestId: /test|demo|sample|dummy/i }],
        })
      : 0,
    invoices: includeTestInvoices
      ? await Invoice.countDocuments({ invoiceId: /test|demo|sample|dummy/i })
      : 0,
  };

  console.log("\n--- Related documents to remove ---");
  for (const [k, v] of Object.entries(relatedCounts)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`  orders: ${orderIds.length}`);

  if (orderIds.length === 0) {
    console.log("\n[clear-test-orders] Nothing matched. Exiting.");
    await disconnectDb();
    return;
  }

  if (dryRun) {
    console.log("\n[clear-test-orders] DRY RUN — no documents deleted.");
    await disconnectDb();
    return;
  }

  if (!skipConfirm) {
    console.log(
      "\nThis will permanently delete the orders above and related rows."
    );
    console.log("Wallet balances are NOT auto-recalculated after transaction deletes.");
    const ok = await promptConfirm('\nType exactly "DELETE TEST ORDERS" to continue: ');
    if (!ok) {
      console.log("[clear-test-orders] Aborted.");
      await disconnectDb();
      process.exit(0);
    }
  } else {
    console.log("[clear-test-orders] Skipping prompt (CLEAR_TEST_ORDERS_CONFIRM=YES --yes)");
  }

  const deleted: DeleteCounts = {};

  // Children first
  deleted.orderSkuAudits = (await OrderSkuAudit.deleteMany({ orderId: { $in: orderIds } })).deletedCount;

  deleted.weightDisputes = (
    await WeightDispute.deleteMany({
      $or: [{ orderId: { $in: orderIds } }, ...(awbs.length ? [{ awb: { $in: awbs } }] : [])],
    })
  ).deletedCount;

  deleted.ndr = awbs.length ? (await NDR.deleteMany({ awb: { $in: awbs } })).deletedCount : 0;

  deleted.returnOrders = (
    await ReturnOrder.deleteMany({
      $or: [
        { originalOrderId: { $in: orderIds } },
        ...(awbs.length ? [{ awb: { $in: awbs } }] : []),
      ],
    })
  ).deletedCount;

  deleted.notifications = (
    await Notification.deleteMany({ "meta.orderId": { $in: orderIds } })
  ).deletedCount;

  deleted.transactions = (
    await Transaction.deleteMany({
      $or: [
        { referenceType: "shipment", referenceId: { $in: shipmentRefIds } },
        { referenceType: "order", referenceId: { $in: orderIds } },
        { referenceId: { $in: orderIds } },
        { referenceId: { $in: shipmentRefIds } },
      ],
    })
  ).deletedCount;

  if (includeTestManifests) {
    deleted.manifests = (
      await Manifest.deleteMany({ manifestId: /test|demo|sample|dummy/i })
    ).deletedCount;
  }

  if (includeTestInvoices) {
    deleted.invoices = (
      await Invoice.deleteMany({ invoiceId: /test|demo|sample|dummy/i })
    ).deletedCount;
  }

  deleted.orders = (await Order.deleteMany({ orderId: { $in: orderIds } })).deletedCount;

  console.log("\n--- Deleted counts ---");
  for (const [k, v] of Object.entries(deleted)) {
    console.log(`  ${k}: ${v}`);
  }

  const remaining = await Order.countDocuments();
  console.log(`\n[clear-test-orders] Orders remaining in database: ${remaining}`);
  console.log(
    "[clear-test-orders] Done. Verify wallets, reports, and Shopify sync if needed."
  );

  await disconnectDb();
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === fileURLToPath(entry);
  } catch {
    return /clearTestOrders\.(ts|js)$/i.test(entry);
  }
}

if (isDirectExecution()) {
  main().catch((err) => {
    console.error("[clear-test-orders] Fatal error:", err);
    void disconnectDb().finally(() => process.exit(1));
  });
}
