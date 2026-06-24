import type { IOrder } from "../models/Order.js";
import { ShopifyStoreConnection } from "../models/ShopifyStoreConnection.js";
import { normalizeOrderStatus } from "../utils/orderStatus.js";
import { decrypt } from "../utils/crypto.js";
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
 * "in_progress" for AWB-generated but not yet delivered; "fulfilled" for delivered.
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

  // ─── Attempt 1: New fulfillment_orders API (requires read/write_merchant_managed_fulfillment_orders) ───
  try {
    const fulfillmentOrders = await shopifyService.getFulfillmentOrders(token, shopDomain, shopifyOrderId);
    const openIds = fulfillmentOrders
      .filter((fo) => ["open", "in_progress", "scheduled"].includes(String(fo.status ?? "").toLowerCase()))
      .map((fo) => fo.id);

    if (openIds.length > 0) {
      await shopifyService.createFulfillment(token, shopDomain, { fulfillmentOrderIds: openIds, ...trackingParams });
      order.shopifyFulfillmentStatus = label;
      await order.save().catch(() => undefined);
      return;
    }
    // All orders already closed/fulfilled
  } catch (e1) {
    void e1;
  }

  // ─── Attempt 2A: POST /fulfillments.json with OLD body format (location_id + line_items) ───
  // Works with write_fulfillments scope (no need for fulfillment_order_ids)
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
      order.shopifyFulfillmentStatus = label;
      await order.save().catch(() => undefined);
      return;
    }
  } catch (e2a) {
    void e2a;
  }

  // ─── Attempt 2B: GET existing fulfillments → PUT update tracking (write_fulfillments) ───
  try {
    const existingFulfillments = await shopifyService.getOrderFulfillments(token, shopDomain, shopifyOrderId);
    if (existingFulfillments.length > 0) {
      const target = existingFulfillments[0];
      await shopifyService.updateFulfillmentTracking(token, shopDomain, target.id, trackingParams);
      order.shopifyFulfillmentStatus = label;
      await order.save().catch(() => undefined);
      return;
    }
  } catch (e2b) {
    void e2b;
  }

  // ─── Attempt 3: Update order note_attributes + tags (requires write_orders only — always works) ───
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
    order.set(
      "shopifyLastFulfillmentSyncError",
      "Shopify Fulfillment Status column could not be updated — add write_fulfillments scope to your Shopify custom app (Shopify Admin → Develop apps → Configuration), save, then reconnect in Settings → Channels. Tracking info has been saved to the order note & tags."
    );
    await order.save().catch(() => undefined);
  } catch (e3) {
    void e3;
    order.shopifyFulfillmentStatus = `${label} (sync failed)`;
    order.set(
      "shopifyLastFulfillmentSyncError",
      "All Shopify sync attempts failed. Add write_fulfillments scope to your Shopify custom app (Shopify Admin → Develop apps → Configuration), save, then reconnect in Settings → Channels."
    );
    await order.save().catch(() => undefined);
  }
}
