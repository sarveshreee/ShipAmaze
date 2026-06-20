import { describe, expect, it } from "vitest";
import {
  buildVelocityProviderOrderId,
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
});
