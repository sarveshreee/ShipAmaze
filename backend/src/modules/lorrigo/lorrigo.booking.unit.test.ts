import { describe, expect, it } from "vitest";
import { buildLorrigoOneClickPayload, parseLorrigoShipmentResult } from "./lorrigo.booking.js";

describe("Lorrigo booking mapping", () => {
  it("builds one-click payload", () => {
    const payload = buildLorrigoOneClickPayload({
      orderId: "ORD-1",
      pickupId: "pickup-1",
      paymentMode: "cod",
      orderAmount: 100,
      codAmount: 100,
      weightKg: 0.5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      courierId: "courier-abc",
      customer: {
        name: "Ada",
        phone: "9876543210",
        address: "Line 1",
        city: "Delhi",
        state: "DL",
        pincode: "110001",
      },
      items: [{ name: "SKU", qty: 1, price: 100, sku: "S1" }],
      providerPayload: {
        pickupAddress: {
          facilityName: "WH",
          contactPersonName: "Bob",
          phone: "9999999999",
          address: "Pickup st",
          pincode: "110085",
          city: "Delhi",
          state: "DL",
        },
      },
    });
    expect(payload.courier_id).toBe("courier-abc");
    expect((payload.order as { paymentMethod: { paymentMethod: string } }).paymentMethod.paymentMethod).toBe(
      "cod"
    );
    expect((payload.order as { amountToCollect: number }).amountToCollect).toBe(100);
  });

  it("normalizes provider response into ProviderShipmentResult", () => {
    const result = parseLorrigoShipmentResult({
      data: {
        awb: "LRG123",
        orderId: "lo-1",
        labelUrl: "https://example.com/l.pdf",
        freight: 42,
      },
    });
    expect(result).toMatchObject({
      awb: "LRG123",
      providerOrderId: "lo-1",
      freightCharge: 42,
    });
  });
});
