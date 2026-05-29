import { describe, it, expect } from "vitest";
import { orderLooksLikeTest } from "./clearTestOrders.js";

describe("orderLooksLikeTest", () => {
  it("flags integration-style and stub tracking orders", () => {
    expect(
      orderLooksLikeTest({
        orderId: "T-12345",
        customer: "Real Name",
        customerEmail: "real@company.com",
      })
    ).toBe(true);

    expect(
      orderLooksLikeTest({
        orderId: "ORD-100",
        customer: "Jane",
        trackingId: "TRK-123-ABC",
        shipmentId: "SHP-123",
      })
    ).toBe(true);
  });

  it("flags demo customer and test email", () => {
    expect(
      orderLooksLikeTest({
        orderId: "ORD-200",
        customer: "Shopify Customer",
        customerEmail: "buyer@shop.com",
      })
    ).toBe(true);

    expect(
      orderLooksLikeTest({
        orderId: "ORD-201",
        customer: "Ali",
        customerEmail: "test@gmail.com",
      })
    ).toBe(true);
  });

  it("keeps plausible production-like orders", () => {
    expect(
      orderLooksLikeTest({
        orderId: "SA-ORD-88421",
        customer: "Priya Sharma",
        customerEmail: "priya.sharma@gmail.com",
        phone: "9876543210",
        awb: "1234567890123",
        shopifyShopDomain: "live-brand.myshopify.com",
      })
    ).toBe(false);
  });
});
