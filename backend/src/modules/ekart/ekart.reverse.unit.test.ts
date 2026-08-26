import { describe, expect, it, vi } from "vitest";

vi.mock("./ekart.config.js", () => ({
  isEkartEnabledFlag: vi.fn(() => true),
  isEkartConfigured: vi.fn(() => true),
  ekartConfig: {
    merchantCode: "TEC",
    defaultLocationCode: "",
    serviceCode: "REGULAR",
    reverseServiceCode: "RETURNS_SMART_CHECK",
    goodsCategory: "NON_ESSENTIAL",
  },
}));

import { buildEkartCreateShipmentPayload, buildEkartClientReferenceId } from "./ekart.payload.js";
import {
  parseEkartCriticalUpdate,
  verifyEkartWebhookSecret,
} from "./ekart.webhooks.js";

describe("buildEkartClientReferenceId", () => {
  it("keeps short ids unchanged", () => {
    expect(buildEkartClientReferenceId("ORD123456789012")).toBe("ORD123456789012");
  });

  it("uses unique trailing digits for long Shopify-style ids", () => {
    const a = buildEkartClientReferenceId(
      "shopify-k7qqag-ph-myshopify-com-7193615565079"
    );
    const b = buildEkartClientReferenceId(
      "shopify-k7qqag-ph-myshopify-com-7193615565080"
    );
    expect(a).toBe("7193615565079");
    expect(b).toBe("7193615565080");
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(15);
  });
});

describe("Ekart reverse payload", () => {
  it("builds REVERSE leg with customer as source", () => {
    const built = buildEkartCreateShipmentPayload({
      orderId: "ORD-REV-1",
      paymentMode: "prepaid",
      orderAmount: 100,
      weightKg: 0.5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      serviceLeg: "REVERSE",
      pickup: {
        label: "WH",
        phone: "9876543210",
        addressLine1: "Warehouse",
        city: "Bengaluru",
        state: "KA",
        pincode: "560001",
      },
      customer: {
        name: "Bob",
        phone: "9123456789",
        address: "45 Park",
        city: "Kolkata",
        state: "WB",
        pincode: "700016",
      },
      items: [{ name: "Shirt", qty: 1, price: 100 }],
    });

    const detail = (built.body.services as any)[0].service_details[0];
    expect(detail.service_leg).toBe("REVERSE");
    expect((built.body.services as any)[0].service_code).toBe("RETURNS_SMART_CHECK");
    expect(detail.service_data.source.address.first_name).toBe("Bob");
    expect(detail.service_data.source.address.pincode).toBe("700016");
    expect(detail.service_data.destination.address.pincode).toBe("560001");
    expect(detail.shipment.tracking_id.charAt(3)).toBe("R");
    expect(detail.service_data.return_location).toBeUndefined();
  });
});

describe("Ekart Critical Updates parse", () => {
  it("parses Durin push event fields", () => {
    const p = parseEkartCriticalUpdate({
      vendor_tracking_id: "ABCC0001201928",
      merchant_reference_id: "ABCC0001201928",
      status: "delivered",
      event: "shipment_delivered",
      location: "Hub",
      event_date: "2019-01-27 20:47:52",
    });
    expect(p.awb).toBe("ABCC0001201928");
    expect(p.status).toBe("delivered");
    expect(p.event).toBe("shipment_delivered");
  });

  it("accepts webhook when no secret configured", async () => {
    const { ekartConfig } = await import("./ekart.config.js");
    // mocked config has no webhookSecret getter — redefine via vi.mocked module
    expect(verifyEkartWebhookSecret({})).toBe(true);
    void ekartConfig;
  });
});
