import { describe, it, expect } from "vitest";
import {
  buildLorrigoServiceabilityPayload,
  estimateFreightFromLorrigoPricing,
  extractLorrigoCourierRows,
  mapLorrigoCourierRow,
  normalizeLorrigoServiceabilityResponse,
} from "./lorrigo.serviceability.js";

describe("Lorrigo serviceability mapping", () => {
  it("builds prepaid payload matching Postman sample fields", () => {
    const payload = buildLorrigoServiceabilityPayload({
      fromPincode: "110085",
      toPincode: "110080",
      paymentMode: "prepaid",
      weightKg: 0.5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    });
    expect(payload).toMatchObject({
      pickupPincode: "110085",
      deliveryPincode: "110080",
      weight: "0.5",
      weightUnit: "kg",
      boxLength: 10,
      boxWidth: 10,
      boxHeight: 10,
      sizeUnit: "cm",
      paymentType: 0,
      collectableAmount: "",
      isReversedOrder: false,
    });
  });

  it("maps COD paymentType and collectable amount", () => {
    const payload = buildLorrigoServiceabilityPayload({
      fromPincode: "110085",
      toPincode: "110080",
      paymentMode: "cod",
      collectableAmount: 499,
    });
    expect(payload.paymentType).toBe(1);
    expect(payload.collectableAmount).toBe("499");
  });

  it("normalizes courier rows into shared ProviderCourierOption shape", () => {
    const raw = {
      data: [
        {
          id: "cme2svzmn013cog5609013n45",
          name: "Delhivery Surface",
          freight: 42.5,
          tat: "2-4 days",
          cod: true,
          pickupAvailable: true,
        },
      ],
    };
    const rows = normalizeLorrigoServiceabilityResponse(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "lorrigo",
      courierId: "cme2svzmn013cog5609013n45",
      courierName: "Delhivery Surface",
      serviceable: true,
      freight: 42.5,
      codSupported: true,
      pickupAvailable: true,
      estimatedDays: 3,
    });
  });

  it("extracts nested envelopes and skips unserviceable rows", () => {
    expect(extractLorrigoCourierRows({ result: { couriers: [{ id: "1", name: "A" }] } })).toHaveLength(
      1
    );
    expect(extractLorrigoCourierRows({ couriers: [{ id: "1", name: "A" }], total: 1 })).toHaveLength(1);
    const mapped = mapLorrigoCourierRow({
      courierId: "x",
      courierName: "X",
      serviceable: false,
    });
    expect(mapped?.serviceable).toBe(false);
    expect(
      normalizeLorrigoServiceabilityResponse({
        data: [{ courierId: "x", courierName: "X", serviceable: false }],
      })
    ).toHaveLength(0);
  });

  it("estimates freight from zone slab pricing (prefer Z_A)", () => {
    const freight = estimateFreightFromLorrigoPricing(
      {
        weight_slab: 0.5,
        increment_weight: 0.5,
        zone_pricing: [
          { zone: "Z_A", base_price: 57, increment_price: 57 },
          { zone: "Z_E", base_price: 90, increment_price: 90 },
        ],
      },
      0.5
    );
    expect(freight).toBe(57);

    const heavier = estimateFreightFromLorrigoPricing(
      {
        weight_slab: 0.5,
        increment_weight: 0.5,
        zone_pricing: [{ zone: "Z_A", base_price: 57, increment_price: 57 }],
      },
      1.2
    );
    // 0.5 base + 2 slabs * 57
    expect(heavier).toBe(57 + 2 * 57);
  });
});
