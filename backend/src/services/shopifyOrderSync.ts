/**
 * Maps Shopify REST order payloads to ShipAmaze Order fields.
 * Used by manual sync and webhooks. Keeps shipment/AWB fields when updating.
 */

import type { Types } from "mongoose";
import type { IOrder } from "../models/Order.js";
import type { ShopifyOrder } from "./shopify.service.js";

export type ShopifySyncUserContext = {
  ownerUserId: Types.ObjectId;
  createdBy: Types.ObjectId;
  dropshipperId?: Types.ObjectId;
  vendorId?: Types.ObjectId;
};

function safeShopKey(shopDomain: string): string {
  return shopDomain.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

/** Shopify REST may return numeric ids as numbers or digit strings. */
export function normalizeShopifyOrderNumericId(id: unknown): number | null {
  if (typeof id === "number" && Number.isFinite(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id.trim())) return parseInt(id.trim(), 10);
  return null;
}

export function shopifyExternalOrderId(shopDomain: string, shopifyNumericId: number): string {
  return `shopify-${safeShopKey(shopDomain)}-${shopifyNumericId}`;
}

/** Map Shopify financial_status to display payment field */
export function mapShopifyFinancialToPayment(financial: string | undefined): string {
  const f = String(financial ?? "").toLowerCase();
  if (f === "paid" || f === "partially_paid") return "Prepaid";
  if (f === "pending" || f === "authorized") return "Prepaid";
  if (f === "refunded" || f === "partially_refunded") return "Prepaid";
  return "COD";
}

/** Map fulfillment + financial hints to internal order status when no shipment yet */
export function mapShopifyToInternalStatus(so: ShopifyOrder): string {
  if (so.cancelled_at) return "cancelled";
  const ff = String(so.fulfillment_status ?? "").toLowerCase();
  if (ff === "fulfilled") return "shipped";
  if (ff === "partial") return "in-transit";
  if (ff === "restocked") return "cancelled";
  const fin = String(so.financial_status ?? "").toLowerCase();
  if (fin === "voided" || fin === "refunded") return "cancelled";
  return "pending";
}

export function buildShopifyOrderPayload(
  shopDomain: string,
  so: ShopifyOrder,
  ctx: ShopifySyncUserContext
): Record<string, unknown> {
  const shipping = so.shipping_address;
  const lineItems = Array.isArray(so.line_items) ? so.line_items : [];
  const externalId = shopifyExternalOrderId(shopDomain, so.id);
  const normalizedStatus = mapShopifyToInternalStatus(so);
  const payment = mapShopifyFinancialToPayment(so.financial_status);
  const createdDate =
    typeof so.created_at === "string" && so.created_at.length >= 10 ? so.created_at.slice(0, 10) : "";

  const products = lineItems.map((li) => ({
    name: li.title || "Item",
    productName: li.title || "Item",
    qty: li.quantity ?? 1,
    price: parseFloat(String(li.price ?? "0")) || 0,
    sku: li.sku ?? "",
    quantity: li.quantity ?? 1,
    discount: Number((li as { total_discount?: string | number }).total_discount ?? 0) || 0,
    tax: Array.isArray((li as { tax_lines?: Array<{ price?: string | number }> }).tax_lines)
      ? ((li as { tax_lines?: Array<{ price?: string | number }> }).tax_lines || []).reduce(
          (sum, t) => sum + (Number(t.price) || 0),
          0
        )
      : 0,
  }));

  const itemBlocks = lineItems.map((li, idx) => ({
    name: li.title || "Item",
    productName: li.title || "Item",
    sku: li.sku || `SKU-${idx + 1}`,
    quantity: li.quantity || 1,
    qty: li.quantity || 1,
    units: li.quantity || 1,
    price: parseFloat(String(li.price ?? "0")) || 0,
    sellingPrice: parseFloat(String(li.price ?? "0")) || 0,
    amount: parseFloat(String(li.price ?? "0")) || 0,
    discount: Number((li as { total_discount?: string | number }).total_discount ?? 0) || 0,
    tax: Array.isArray((li as { tax_lines?: Array<{ price?: string | number }> }).tax_lines)
      ? ((li as { tax_lines?: Array<{ price?: string | number }> }).tax_lines || []).reduce(
          (sum, t) => sum + (Number(t.price) || 0),
          0
        )
      : 0,
  }));

  const note = typeof (so as { note?: string }).note === "string" ? String((so as { note?: string }).note) : "";
  const tags = typeof (so as { tags?: string }).tags === "string" ? String((so as { tags?: string }).tags) : "";

  return {
    orderId: externalId,
    customer: shipping?.name || so.email || "Shopify Customer",
    phone: shipping?.phone || so.phone || "",
    address: shipping?.address1 || "",
    city: shipping?.city || "",
    state: (shipping as { province?: string } | undefined)?.province || "",
    pincode: shipping?.zip || "",
    weight: "",
    courier: "Delhivery",
    payment,
    status: normalizedStatus,
    date: createdDate,
    awb: "",
    amount: parseFloat(String(so.total_price ?? "0")) || 0,
    products,
    items: itemBlocks,
    orderItems: itemBlocks,
    shopifyLineItems: lineItems,
    createdBy: ctx.createdBy,
    ownerUserId: ctx.ownerUserId,
    dropshipperId: ctx.dropshipperId,
    vendorId: ctx.vendorId,
    channel: "Shopify",
    externalSource: "shopify",
    sourceType: "shopify",
    externalOrderName: so.name,
    isJunk: false,
    shipmentStatus: "pending",
    customerEmail: so.email || "",
    customerPhone: shipping?.phone || so.phone || "",
    shippingAddress1: shipping?.address1 || "",
    shippingAddress2: (shipping as { address2?: string } | undefined)?.address2 || "",
    shippingPincode: shipping?.zip || "",
    shippingCity: shipping?.city || "",
    shippingState: (shipping as { province?: string } | undefined)?.province || "",
    shopifyShopDomain: shopDomain.toLowerCase(),
    shopifyOrderNumericId: String(so.id),
    shopifyFinancialStatus: so.financial_status || "",
    shopifyFulfillmentStatus: so.fulfillment_status ?? "",
    shopifyNote: note,
    shopifyTags: tags,
    lastShopifySyncAt: new Date(),
  };
}

export function hasLocalShipment(existing: {
  shipmentCreated?: boolean;
  awb?: string;
  trackingId?: string;
  shipmentId?: string;
  velocityShipmentId?: string;
  velocityOrderId?: string;
}): boolean {
  return Boolean(
    existing.shipmentCreated ||
      String(existing.awb ?? "").trim() ||
      String(existing.trackingId ?? "").trim() ||
      String(existing.shipmentId ?? "").trim() ||
      String(existing.velocityShipmentId ?? "").trim() ||
      String(existing.velocityOrderId ?? "").trim()
  );
}

/** Apply Shopify fields onto an existing Order document without clobbering shipment state. */
export function mergeShopifyPayloadIntoOrder(existing: IOrder, mapped: Record<string, unknown>, forceCancelled?: boolean) {
  existing.customer = String(mapped.customer ?? existing.customer);
  existing.phone = String(mapped.phone ?? existing.phone);
  existing.address = String(mapped.address ?? existing.address);
  existing.city = String(mapped.city ?? existing.city);
  existing.state = String(mapped.state ?? existing.state ?? "");
  existing.pincode = String(mapped.pincode ?? existing.pincode);
  existing.amount = Number(mapped.amount ?? existing.amount);
  existing.products = (mapped.products as unknown[]) ?? existing.products;
  existing.set("items", mapped.items ?? existing.get("items"));
  existing.set("orderItems", mapped.orderItems ?? existing.get("orderItems"));
  existing.set("shopifyLineItems", mapped.shopifyLineItems ?? existing.get("shopifyLineItems"));
  existing.payment = String(mapped.payment ?? existing.payment);
  existing.isJunk = false;
  existing.channel = "Shopify";
  existing.externalSource = "shopify";
  existing.set("sourceType", "shopify");
  existing.externalOrderName = String(mapped.externalOrderName ?? existing.externalOrderName);
  existing.customerEmail = String(mapped.customerEmail ?? existing.customerEmail ?? "");
  existing.customerPhone = String(mapped.customerPhone ?? existing.customerPhone ?? "");
  existing.shippingAddress1 = String(mapped.shippingAddress1 ?? existing.shippingAddress1 ?? "");
  existing.shippingAddress2 = String(mapped.shippingAddress2 ?? existing.shippingAddress2 ?? "");
  existing.shippingPincode = String(mapped.shippingPincode ?? existing.shippingPincode ?? "");
  existing.shippingCity = String(mapped.shippingCity ?? existing.shippingCity ?? "");
  existing.shippingState = String(mapped.shippingState ?? existing.shippingState ?? "");
  existing.shopifyShopDomain = String(mapped.shopifyShopDomain ?? existing.shopifyShopDomain ?? "");
  existing.shopifyOrderNumericId = String(mapped.shopifyOrderNumericId ?? existing.shopifyOrderNumericId ?? "");
  existing.shopifyFinancialStatus = String(mapped.shopifyFinancialStatus ?? existing.shopifyFinancialStatus ?? "");
  existing.shopifyFulfillmentStatus = String(mapped.shopifyFulfillmentStatus ?? existing.shopifyFulfillmentStatus ?? "");
  existing.shopifyNote = String(mapped.shopifyNote ?? existing.shopifyNote ?? "");
  existing.shopifyTags = String(mapped.shopifyTags ?? existing.shopifyTags ?? "");
  existing.lastShopifySyncAt = new Date();

  if (forceCancelled) {
    if (!hasLocalShipment(existing)) {
      existing.status = "cancelled";
      existing.shipmentStatus = "cancelled";
    }
    return;
  }

  const hasShip = hasLocalShipment(existing);
  if (!hasShip) {
    existing.status = String(mapped.status ?? existing.status);
    if (!existing.shipmentStatus) existing.shipmentStatus = "pending";
  }
}
