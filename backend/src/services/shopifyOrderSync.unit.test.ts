import { describe, it, expect } from "vitest";
import {
  shopifyExternalOrderId,
  mapShopifyFinancialToPayment,
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

  it("mapShopifyToInternalStatus maps fulfilment and financial hints", () => {
    const base = { id: 1 } as unknown as ShopifyOrder;
    expect(mapShopifyToInternalStatus({ ...base, financial_status: "paid", fulfillment_status: null })).toBe("pending");
    expect(mapShopifyToInternalStatus({ ...base, fulfillment_status: "fulfilled" })).toBe("shipped");
  });
});
