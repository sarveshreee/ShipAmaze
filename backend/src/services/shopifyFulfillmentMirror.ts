import type { IOrder } from "../models/Order.js";
import { ShopifyStoreConnection } from "../models/ShopifyStoreConnection.js";
import { normalizeOrderStatus } from "../utils/orderStatus.js";
import { decrypt } from "../utils/crypto.js";
import {
  missingShopifyScopes,
  parseShopifyScopeList,
  SHOPIFY_FULFILLMENT_WRITE_SCOPES,
} from "../utils/shopifyScopes.js";
import * as shopifyService from "./shopify.service.js";

function titleCaseStatus(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Maps an order's local status to a human-readable label stored in shopifyFulfillmentStatus.
 * After AWB booking we push a native Shopify fulfillment (admin shows Fulfilled);
 * local label stays "In Progress" until delivered.
 */
export function shopifyFulfillmentLabelForOrder(order: Pick<IOrder, "status" | "shipmentStatus" | "awb">): string {
  const raw = String(normalizeOrderStatus(order.status) || normalizeOrderStatus(order.shipmentStatus) || "");
  if (!String(order.awb ?? "").trim()) return "Unfulfilled";
  if (raw === "delivered") return "Fulfilled";
  if (raw === "cancelled" || raw === "failed" || raw === "rto" || raw === "return_to_origin") return titleCaseStatus(raw);
  // AWB present + any other status (pending_pickup, in_transit, out_for_delivery, etc.) → In Progress
  return "In Progress";
}

export function mirrorShopifyFulfillmentStatus(order: IOrder): void {
  const isShopify =
    String(order.externalSource ?? "").toLowerCase() === "shopify" ||
    String(order.channel ?? "").toLowerCase() === "shopify" ||
    Boolean(String(order.shopifyShopDomain ?? "").trim());
  if (!isShopify) return;
  order.shopifyFulfillmentStatus = shopifyFulfillmentLabelForOrder(order);
  order.lastShopifySyncAt = new Date();
}

const OPEN_FO_STATUSES = new Set(["open", "in_progress", "scheduled", "on_hold"]);

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "unknown error");
}

async function markSyncOk(order: IOrder, label: string): Promise<void> {
  order.shopifyFulfillmentStatus = label;
  order.lastShopifySyncAt = new Date();
  order.set("shopifyLastFulfillmentSyncError", undefined);
  await order.save().catch(() => undefined);
}

/**
 * Creates / updates a native Shopify fulfillment so Admin shows Fulfilled after AWB booking.
 * Falls back to notes/tags only when fulfillment scopes are missing.
 */
export async function pushShopifyFulfillmentUpdate(order: IOrder): Promise<void> {
  const shopDomain = String(order.shopifyShopDomain ?? "").trim().toLowerCase();
  const shopifyOrderId = String(order.shopifyOrderNumericId ?? "").trim();
  const awb = String(order.awb || order.trackingId || "").trim();
  const ownerUserId = order.ownerUserId ?? order.createdBy;

  if (!shopDomain || !shopifyOrderId || !awb || !ownerUserId) {
    return;
  }

  const conn = await ShopifyStoreConnection.findOne({ ownerUserId, shopDomain, isActive: true });

  if (!conn?.accessTokenEncrypted) return;

  const token = decrypt(conn.accessTokenEncrypted);
  const label = shopifyFulfillmentLabelForOrder(order);
  const trackingParams = {
    trackingNumber: awb,
    trackingUrl: order.trackingUrl || undefined,
    trackingCompany: (order.courierName || order.courier || undefined) as string | undefined,
  };

  const granted = parseShopifyScopeList(conn.scope);
  const missingWrite = missingShopifyScopes(granted, SHOPIFY_FULFILLMENT_WRITE_SCOPES);
  const lastErrors: string[] = [];

  // ─── Attempt 0: already fulfilled on Shopify → update tracking (POST) ───
  try {
    const existingFulfillments = await shopifyService.getOrderFulfillments(token, shopDomain, shopifyOrderId);
    const successOnes = existingFulfillments.filter((f) => String(f.status ?? "").toLowerCase() === "success");
    if (successOnes.length > 0) {
      try {
        await shopifyService.updateFulfillmentTracking(token, shopDomain, successOnes[0]!.id, trackingParams);
      } catch (trackErr) {
        // Tracking update is best-effort — order is already Fulfilled in Shopify Admin.
        lastErrors.push(`tracking update: ${errMessage(trackErr)}`);
      }
      await markSyncOk(order, label);
      return;
    }
  } catch (e0) {
    lastErrors.push(`existing fulfillments: ${errMessage(e0)}`);
  }

  // ─── Attempt 1: Fulfillment Orders API (native Fulfilled in Admin) ───
  try {
    const fulfillmentOrders = await shopifyService.getFulfillmentOrders(token, shopDomain, shopifyOrderId);
    const openIds = fulfillmentOrders
      .filter((fo) => OPEN_FO_STATUSES.has(String(fo.status ?? "").toLowerCase()))
      .map((fo) => fo.id);

    if (openIds.length > 0) {
      await shopifyService.createFulfillment(token, shopDomain, { fulfillmentOrderIds: openIds, ...trackingParams });
      await markSyncOk(order, label);
      return;
    }

    // All FOs closed ⇒ Shopify already shows Fulfilled
    if (fulfillmentOrders.length > 0) {
      await markSyncOk(order, label);
      return;
    }
  } catch (e1) {
    lastErrors.push(`fulfillment_orders: ${errMessage(e1)}`);
  }

  // ─── Attempt 2A: POST /fulfillments.json old body (location + line_items) ───
  try {
    const [locations, lineItems] = await Promise.all([
      shopifyService.getLocations(token, shopDomain),
      shopifyService.getOrderLineItems(token, shopDomain, shopifyOrderId),
    ]);
    const activeLocation = locations.find((l) => l.active) ?? locations[0];
    const fulfillableItems = lineItems.filter((li) => (li.fulfillable_quantity ?? 0) > 0).map((li) => li.id);

    if (activeLocation && fulfillableItems.length > 0) {
      await shopifyService.createFulfillmentNewEndpointOldFormat(token, shopDomain, {
        locationId: activeLocation.id,
        lineItemIds: fulfillableItems,
        ...trackingParams,
      });
      await markSyncOk(order, label);
      return;
    }

    // Nothing left to fulfill ⇒ already Fulfilled on Shopify
    if (lineItems.length > 0 && fulfillableItems.length === 0) {
      await markSyncOk(order, label);
      return;
    }
  } catch (e2a) {
    lastErrors.push(`legacy create: ${errMessage(e2a)}`);
  }

  // ─── Attempt 2B: update tracking on any existing fulfillment ───
  try {
    const existingFulfillments = await shopifyService.getOrderFulfillments(token, shopDomain, shopifyOrderId);
    if (existingFulfillments.length > 0) {
      await shopifyService.updateFulfillmentTracking(token, shopDomain, existingFulfillments[0]!.id, trackingParams);
      await markSyncOk(order, label);
      return;
    }
  } catch (e2b) {
    lastErrors.push(`update tracking: ${errMessage(e2b)}`);
  }

  // ─── Attempt 3: notes + tags (does NOT set Shopify Fulfilled column) ───
  const scopeHint =
    missingWrite.length > 0
      ? `Missing scopes on connected app: ${missingWrite.join(", ")}. ` +
        "In Shopify Admin → Develop apps → Configuration, enable write_fulfillments and " +
        "write_merchant_managed_fulfillment_orders (plus read variants), save, then reconnect in Channels."
      : "Add write_fulfillments + write_merchant_managed_fulfillment_orders to your Shopify custom app, save, then reconnect in Channels.";

  try {
    const existingTags = String((order as { shopifyTags?: string }).shopifyTags ?? "");
    await shopifyService.updateOrderTrackingNote(token, shopDomain, shopifyOrderId, {
      awb,
      status: label,
      trackingUrl: trackingParams.trackingUrl,
      courierName: trackingParams.trackingCompany,
      existingTags,
    });
    order.shopifyFulfillmentStatus = `${label} (note updated)`;
    order.lastShopifySyncAt = new Date();
    order.set(
      "shopifyLastFulfillmentSyncError",
      `Shopify Fulfillment column could not be set to Fulfilled. ${scopeHint}` +
        (lastErrors.length ? ` Details: ${lastErrors.slice(0, 2).join(" | ")}` : "")
    );
    await order.save().catch(() => undefined);
  } catch (e3) {
    void e3;
    order.shopifyFulfillmentStatus = `${label} (sync failed)`;
    order.lastShopifySyncAt = new Date();
    order.set(
      "shopifyLastFulfillmentSyncError",
      `All Shopify sync attempts failed. ${scopeHint}` +
        (lastErrors.length ? ` Details: ${lastErrors.slice(0, 2).join(" | ")}` : "")
    );
    await order.save().catch(() => undefined);
  }
}
