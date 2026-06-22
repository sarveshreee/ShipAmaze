import { describe, expect, it } from "vitest";
import {
  buildVelocityForwardOrchestrationPayload,
  buildVelocityProviderOrderId,
  normalizeVelocityProviderOrderId,
  VELOCITY_PROVIDER_ORDER_ID_MAX,
} from "./velocity.payload.js";

describe("buildVelocityProviderOrderId", () => {
  it("keeps short order ids with suffix under 50 chars", () => {
    const id = buildVelocityProviderOrderId("10001");
    expect(id.length).toBeLessThanOrEqual(VELOCITY_PROVIDER_ORDER_ID_MAX);
    expect(id.startsWith("10001-")).toBe(true);
  });

  it("compresses long Shopify order ids to fit Ekart 50-char limit", () => {
    const shopifyId = "shopify-xw22ed-ag-myshopify-com-6693441011790";
    expect(shopifyId.length).toBeGreaterThan(40);
    const id = buildVelocityProviderOrderId(shopifyId);
    expect(id.length).toBeLessThanOrEqual(VELOCITY_PROVIDER_ORDER_ID_MAX);
    expect(id).toMatch(/^SA-[a-f0-9]{10}-/);
  });

  it("never exceeds max length for very long ids", () => {
    const longId = "x".repeat(120);
    const id = buildVelocityProviderOrderId(longId);
    expect(id.length).toBeLessThanOrEqual(VELOCITY_PROVIDER_ORDER_ID_MAX);
  });

  it("compacts Shopify order ids even when the raw id is under the hard provider limit", () => {
    const id = normalizeVelocityProviderOrderId("shopify-qwerbf-hp-myshopify-com-694708700098");
    expect(id.length).toBeLessThanOrEqual(VELOCITY_PROVIDER_ORDER_ID_MAX);
    expect(id).toMatch(/^SA-[a-f0-9]{10}-/);
  });

  it("keeps short manual order ids readable", () => {
    expect(normalizeVelocityProviderOrderId("ORD-12345")).toBe("ORD-12345");
  });

  it("sanitizes line item text before sending courier payloads", () => {
    const payload = buildVelocityForwardOrchestrationPayload({
      warehouse_id: "WHZBRR",
      order_id: "ORD-12345",
      payment_mode: "cod",
      cod_amount: 699,
      order_amount: 699,
      weight: 0.5,
      length: 1,
      width: 1,
      height: 1,
      customer: {
        name: "Razida chowdhary",
        phone: "9999999999",
        address: "Purkhoo camp",
        city: "Jammu",
        state: "Jammu and Kashmir",
        pincode: "181205",
      },
      items: [{ name: "FLEXI WIPE | 180° Rotating Head", sku: "SKU\\501", qty: 1, price: 699 }],
    });

    expect(payload.order_items).toEqual([
      expect.objectContaining({
        name: "FLEXI WIPE 180 Rotating Head",
        sku: "SKU 501",
      }),
    ]);
  });
});
