import { describe, expect, it } from "vitest";
import {
  shopifyExternalOrderId,
  mapShopifyFinancialToPayment,
  mapShopifyOrderPayment,
  shopifyOrderIsCod,
  mapShopifyToInternalStatus,
  isShopifyOrderCancelled,
  applyShopifyCancellationToOrder,
  mergeShopifyPayloadIntoOrder,
  SHOPIFY_CANCEL_REMARK,
} from "./shopifyOrderSync.js";
import type { ShopifyOrder } from "./shopify.service.js";
import type { IOrder } from "../models/Order.js";

describe("shopifyOrderSync helpers", () => {
  it("shopifyExternalOrderId is stable", () => {
    expect(shopifyExternalOrderId("acme.myshopify.com", 12345)).toBe("shopify-acme-myshopify-com-12345");
  });

  it("mapShopifyFinancialToPayment maps known values", () => {
    expect(mapShopifyFinancialToPayment("paid")).toBe("Prepaid");
    expect(mapShopifyFinancialToPayment("pending")).toBe("Prepaid");
    expect(mapShopifyFinancialToPayment(undefined)).toBe("COD");
  });

  it("mapShopifyOrderPayment detects COD from payment gateway", () => {
    const codOrder = {
      id: 1,
      financial_status: "pending",
      payment_gateway_names: ["Cash on Delivery (COD)"],
    } as unknown as ShopifyOrder;
    expect(shopifyOrderIsCod(codOrder)).toBe(true);
    expect(mapShopifyOrderPayment(codOrder)).toBe("COD");
  });

  it("mapShopifyOrderPayment treats paid online orders as Prepaid", () => {
    const prepaid = {
      id: 2,
      financial_status: "paid",
      payment_gateway_names: ["Razorpay"],
    } as unknown as ShopifyOrder;
    expect(mapShopifyOrderPayment(prepaid)).toBe("Prepaid");
  });

  it("mapShopifyOrderPayment detects COD from tags", () => {
    const tagged = {
      id: 3,
      financial_status: "pending",
      tags: "COD, express",
    } as unknown as ShopifyOrder;
    expect(mapShopifyOrderPayment(tagged)).toBe("COD");
  });

  it("mapShopifyOrderPayment detects COD from manual gateway with pending status", () => {
    const manual = {
      id: 4,
      financial_status: "pending",
      payment_gateway_names: ["manual"],
    } as unknown as ShopifyOrder;
    expect(shopifyOrderIsCod(manual)).toBe(true);
    expect(mapShopifyOrderPayment(manual)).toBe("COD");
  });

  it("mapShopifyOrderPayment treats pending + online gateway as Prepaid", () => {
    const pendingOnline = {
      id: 5,
      financial_status: "pending",
      payment_gateway_names: ["razorpay"],
    } as unknown as ShopifyOrder;
    expect(shopifyOrderIsCod(pendingOnline)).toBe(false);
    expect(mapShopifyOrderPayment(pendingOnline)).toBe("Prepaid");
  });

  it("mapShopifyOrderPayment defaults unknown pending to COD", () => {
    const unknownPending = {
      id: 6,
      financial_status: "pending",
      payment_gateway_names: [],
    } as unknown as ShopifyOrder;
    expect(mapShopifyOrderPayment(unknownPending)).toBe("COD");
  });

  it("mapShopifyToInternalStatus maps fulfilment and financial hints", () => {
    const base = { id: 1 } as unknown as ShopifyOrder;
    expect(mapShopifyToInternalStatus({ ...base, financial_status: "paid", fulfillment_status: null })).toBe("pending");
    expect(mapShopifyToInternalStatus({ ...base, fulfillment_status: "fulfilled" })).toBe("shipped");
    expect(mapShopifyToInternalStatus({ ...base, financial_status: "refunded" })).toBe("cancelled");
  });

  it("isShopifyOrderCancelled detects refunded and cancelled_at", () => {
    const base = { id: 1 } as unknown as ShopifyOrder;
    expect(isShopifyOrderCancelled({ ...base, cancelled_at: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(isShopifyOrderCancelled({ ...base, financial_status: "refunded" })).toBe(true);
    expect(isShopifyOrderCancelled({ ...base, financial_status: "paid" })).toBe(false);
  });

  it("applyShopifyCancellationToOrder moves pre-shipment orders to junk with remark", () => {
    const existing = {
      isJunk: false,
      status: "pending",
      shipmentStatus: "pending",
      awb: "",
      adminRemark: "",
      statusHistory: [],
      save: () => undefined,
      set: () => undefined,
      get: () => undefined,
    } as unknown as IOrder;

    expect(applyShopifyCancellationToOrder(existing)).toBe(true);
    expect(existing.isJunk).toBe(true);
    expect(existing.status).toBe("junk");
    expect(existing.adminRemark).toBe(SHOPIFY_CANCEL_REMARK);
    expect(existing.junkReason).toBe(SHOPIFY_CANCEL_REMARK);
  });

  it("applyShopifyCancellationToOrder moves stuck cancelled orders to junk", () => {
    const existing = {
      isJunk: false,
      status: "cancelled",
      shipmentStatus: "cancelled",
      awb: "",
      adminRemark: "",
      statusHistory: [],
      save: () => undefined,
      set: () => undefined,
      get: () => undefined,
    } as unknown as IOrder;

    expect(applyShopifyCancellationToOrder(existing)).toBe(true);
    expect(existing.isJunk).toBe(true);
    expect(existing.status).toBe("junk");
  });

  it("mergeShopifyPayloadIntoOrder moves refunded Shopify orders to junk", () => {
    const existing = {
      isJunk: false,
      status: "pending",
      shipmentStatus: "pending",
      awb: "",
      customer: "Old",
      adminRemark: "",
      statusHistory: [],
      save: () => undefined,
      set: () => undefined,
      get: () => undefined,
    } as unknown as IOrder;

    mergeShopifyPayloadIntoOrder(existing, {
      customer: "New from Shopify",
      status: "cancelled",
      items: [],
      orderItems: [],
      shopifyLineItems: [],
    });

    expect(existing.isJunk).toBe(true);
    expect(existing.status).toBe("junk");
    expect(existing.adminRemark).toBe(SHOPIFY_CANCEL_REMARK);
    expect(existing.customer).toBe("New from Shopify");
  });

  it("mergeShopifyPayloadIntoOrder preserves junk orders", () => {
    const existing = {
      isJunk: true,
      status: "junk",
      junkedAt: new Date("2026-01-01"),
      customer: "Old",
      save: () => undefined,
      set: () => undefined,
      get: () => undefined,
    } as unknown as IOrder;

    mergeShopifyPayloadIntoOrder(existing, {
      customer: "New from Shopify",
      status: "pending",
      items: [],
      orderItems: [],
      shopifyLineItems: [],
    });

    expect(existing.isJunk).toBe(true);
    expect(existing.status).toBe("junk");
    expect(existing.customer).toBe("New from Shopify");
  });

  it("mergeShopifyPayloadIntoOrder preserves reship orders", () => {
    const existing = {
      isJunk: false,
      status: "reship",
      shipmentStatus: "reship",
      awb: "",
      customer: "Old",
      save: () => undefined,
      set: () => undefined,
      get: () => undefined,
    } as unknown as IOrder;

    mergeShopifyPayloadIntoOrder(existing, {
      customer: "New from Shopify",
      status: "pending",
      items: [],
      orderItems: [],
      shopifyLineItems: [],
    });

    expect(existing.status).toBe("reship");
    expect(existing.shipmentStatus).toBe("reship");
    expect(existing.customer).toBe("New from Shopify");
  });
});
