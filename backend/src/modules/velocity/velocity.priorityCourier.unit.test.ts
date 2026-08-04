import { describe, expect, it } from "vitest";
import { pickPriorityServiceableCourier, courierNameMatches } from "./velocity.resolveCarrier.js";
import { normalizeForwardOrderResponse } from "./velocity.service.js";
import type { VelocityCarrier } from "./velocity.types.js";

function carrier(id: string, name: string): VelocityCarrier {
  return { carrier_id: id, carrier_name: name } as VelocityCarrier;
}

describe("pickPriorityServiceableCourier", () => {
  const serviceable = [
    carrier("amz", "Amazon Standard 250G"),
    carrier("sfx", "Shadowfax Standard"),
    carrier("dlv", "Delhivery Standard"),
    carrier("xb", "Xpressbees Standard"),
  ];

  it("picks the highest-ranked courier that is serviceable", () => {
    const picked = pickPriorityServiceableCourier(
      [
        { courierName: "Ekart Standard", carrierId: "ek", rank: 1 },
        { courierName: "Delhivery Standard", carrierId: "dlv", rank: 2 },
        { courierName: "Shadowfax Standard", carrierId: "sfx", rank: 3 },
      ],
      serviceable
    );
    expect(picked).toEqual({ carrier_id: "dlv", carrier_name: "Delhivery Standard", provider: "velocity" });
  });

  it("matches by courier name when carrierId is missing or stale", () => {
    const picked = pickPriorityServiceableCourier(
      [
        { courierName: "Amazon Standard 250G", rank: 1 },
        { courierName: "Shadowfax Standard", rank: 2 },
      ],
      serviceable
    );
    expect(picked?.carrier_id).toBe("amz");
    expect(picked?.carrier_name).toBe("Amazon Standard 250G");
  });

  it("skips non-serviceable priorities and does not return multiple", () => {
    const picked = pickPriorityServiceableCourier(
      [
        { courierName: "Ekart Standard", rank: 1 },
        { courierName: "DTDC Standard", rank: 2 },
        { courierName: "Xpressbees Standard", rank: 3 },
        { courierName: "Shadowfax Standard", rank: 4 },
      ],
      serviceable
    );
    expect(picked).toEqual({ carrier_id: "xb", carrier_name: "Xpressbees Standard", provider: "velocity" });
  });

  it("returns undefined when none of the priority couriers are serviceable", () => {
    const picked = pickPriorityServiceableCourier(
      [
        { courierName: "Ekart Standard", rank: 1 },
        { courierName: "Ecom Standard", rank: 2 },
      ],
      serviceable
    );
    expect(picked).toBeUndefined();
  });

  it("returns undefined when serviceability list is empty", () => {
    expect(
      pickPriorityServiceableCourier([{ courierName: "Delhivery Standard", rank: 1 }], [])
    ).toBeUndefined();
  });

  it("prefers exact carrierId match over fuzzy name when both could match", () => {
    const picked = pickPriorityServiceableCourier(
      [{ courierName: "Amazon", carrierId: "sfx", rank: 1 }],
      serviceable
    );
    // carrierId wins first
    expect(picked?.carrier_id).toBe("sfx");
  });

  it("Krishna Verma scenario: many serviceable couriers → only priority #1 is chosen", () => {
    const allSeven = [
      carrier("ek", "Ekart Standard"),
      carrier("dlv", "Delhivery Standard"),
      carrier("amzt", "Amazon Transportation"),
      carrier("xb", "Xpressbees Standard"),
      carrier("dtdc", "DTDC Standard"),
      carrier("sfx", "Shadowfax Standard"),
      carrier("amz250", "Amazon Standard 250G"),
    ];
    const priorities = [
      { courierName: "Ekart Standard", rank: 1 },
      { courierName: "Delhivery Standard", rank: 2 },
      { courierName: "Amazon Transportation", rank: 3 },
      { courierName: "Xpressbees Standard", rank: 4 },
      { courierName: "DTDC Standard", rank: 5 },
      { courierName: "Shadowfax Standard", rank: 6 },
      { courierName: "Amazon Standard 250G", rank: 7 },
    ];
    const picked = pickPriorityServiceableCourier(priorities, allSeven);
    expect(picked).toEqual({ carrier_id: "ek", carrier_name: "Ekart Standard", provider: "velocity" });
  });

  it("skips unserviceable #1 and picks next ranked serviceable courier only", () => {
    const serviceableSubset = [
      carrier("sfx", "Shadowfax Standard"),
      carrier("amz250", "Amazon Standard 250G"),
      carrier("dlv", "Delhivery Standard"),
    ];
    const priorities = [
      { courierName: "Ekart Standard", rank: 1 },
      { courierName: "Delhivery Standard", rank: 2 },
      { courierName: "Shadowfax Standard", rank: 3 },
    ];
    const picked = pickPriorityServiceableCourier(priorities, serviceableSubset);
    expect(picked).toEqual({ carrier_id: "dlv", carrier_name: "Delhivery Standard", provider: "velocity" });
  });
  it("does not fuzzy-match Lorrigo Delhivery Spcl onto Velocity Delhivery Standard", () => {
    const mixed = [
      { carrier_id: "dlv-v", carrier_name: "Delhivery Standard", provider: "velocity" as const },
      { carrier_id: "dlv-l", carrier_name: "Delhivery Spcl 500 gm", provider: "lorrigo" as const },
      { carrier_id: "ek", carrier_name: "Ekart Standard", provider: "velocity" as const },
    ];
    const picked = pickPriorityServiceableCourier(
      [{ courierName: "Delhivery Spcl 500 gm", carrierId: "dlv-l", provider: "lorrigo", rank: 1 }],
      mixed
    );
    expect(picked).toEqual({
      carrier_id: "dlv-l",
      carrier_name: "Delhivery Spcl 500 gm",
      provider: "lorrigo",
    });
  });

  it("exact-name matches Lorrigo even when provider was not saved on priority entry", () => {
    const mixed = [
      { carrier_id: "dlv-v", carrier_name: "Delhivery Standard", provider: "velocity" as const },
      { carrier_id: "dlv-l", carrier_name: "Delhivery Spcl 500 gm", provider: "lorrigo" as const },
    ];
    const picked = pickPriorityServiceableCourier(
      [{ courierName: "Delhivery Spcl 500 gm", rank: 1 }],
      mixed
    );
    expect(picked?.provider).toBe("lorrigo");
    expect(picked?.carrier_id).toBe("dlv-l");
  });
});

describe("courierNameMatches", () => {
  it("matches brand aliases used in priority lists", () => {
    expect(courierNameMatches("Ekart", "Ekart Standard")).toBe(true);
    expect(courierNameMatches("Delhivery Standard", "Delhivery Standard")).toBe(true);
    expect(courierNameMatches("Amazon Standard 250G", "Amazon Transportation")).toBe(true);
  });
});

describe("normalizeForwardOrderResponse AWB fields", () => {
  it("reads awb_code when present", () => {
    const r = normalizeForwardOrderResponse({ order_id: "o1", awb_code: "AWB1", courier_name: "X" });
    expect(r.awb_code).toBe("AWB1");
  });

  it("falls back to awb / tracking_number so missing awb_code does not look empty", () => {
    expect(normalizeForwardOrderResponse({ awb: "AWB2" }).awb_code).toBe("AWB2");
    expect(normalizeForwardOrderResponse({ tracking_number: "AWB3" }).awb_code).toBe("AWB3");
    expect(normalizeForwardOrderResponse({ trackingNumber: "AWB4" }).awb_code).toBe("AWB4");
  });
});
