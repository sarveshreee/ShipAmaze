import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();

vi.mock("./ekart.client.js", () => ({
  ekartPost: (...args: unknown[]) => postMock(...args),
}));

vi.mock("./ekart.config.js", () => ({
  ekartConfig: {
    serviceabilityEndpoint: "/v1/offerings",
    serviceCode: "REGULAR",
  },
}));

import { fetchEkartServiceableCouriers } from "./ekart.serviceability.js";

describe("Ekart offerings → discovery options", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("maps serviceable connections into ProviderCourierOption for shared discovery", async () => {
    postMock.mockResolvedValue({
      serviceable: true,
      cod: true,
      lane: "metro",
      connections: {
        REGULAR: { serviceable: true, SLA: "2" },
        ECONOMY: { serviceable: true, SLA: "4" },
      },
    });

    const opts = await fetchEkartServiceableCouriers({
      fromPincode: "560001",
      toPincode: "110001",
      paymentMode: "prepaid",
      weightKg: 0.5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    });

    expect(postMock).toHaveBeenCalledWith(
      "/v1/offerings",
      expect.objectContaining({
        service_type: "FORWARD",
        seller_pincode: "560001",
        customer_pincode: "110001",
      }),
      expect.any(Object)
    );
    expect(opts.length).toBe(2);
    expect(opts.every((o) => o.provider === "ekart")).toBe(true);
    expect(opts.every((o) => o.serviceable)).toBe(true);
    expect(opts.map((o) => o.courierId)).toEqual(
      expect.arrayContaining(["ekart:REGULAR", "ekart:ECONOMY"])
    );
  });

  it("uses REVERSE service_type for return discovery", async () => {
    postMock.mockResolvedValue({ serviceable: false });
    await fetchEkartServiceableCouriers({
      fromPincode: "560001",
      toPincode: "110001",
      paymentMode: "prepaid",
      shipmentType: "return",
    });
    expect(postMock.mock.calls[0][1].service_type).toBe("REVERSE");
  });

  it("returns empty when not serviceable", async () => {
    postMock.mockResolvedValue({ serviceable: false });
    const opts = await fetchEkartServiceableCouriers({
      fromPincode: "560001",
      toPincode: "999999",
      paymentMode: "cod",
    });
    expect(opts).toEqual([]);
  });
});
