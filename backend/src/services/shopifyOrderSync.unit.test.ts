import { describe, expect, it } from "vitest";
import {
  shopifyExternalOrderId,
  mapShopifyFinancialToPayment,
  mapShopifyOrderPayment,
  shopifyOrderIsCod,
  mapShopifyToInternalStatus,
} from "./shopifyOrderSync.js";
import type { ShopifyOrder } from "./shopify.service.js";

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

  it("mapShopifyToInternalStatus maps fulfilment and financial hints", () => {
    const base = { id: 1 } as unknown as ShopifyOrder;
    expect(mapShopifyToInternalStatus({ ...base, financial_status: "paid", fulfillment_status: null })).toBe("pending");
    expect(mapShopifyToInternalStatus({ ...base, fulfillment_status: "fulfilled" })).toBe("shipped");
  });
});
