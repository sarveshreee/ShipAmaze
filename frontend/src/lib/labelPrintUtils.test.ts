import { describe, expect, it } from "vitest";
import { isAmazonTransportationOrder, shouldUseVelocityCourierPdf } from "./labelPrintUtils";

describe("labelPrintUtils", () => {
  it("detects Amazon Transportation couriers", () => {
    expect(isAmazonTransportationOrder({ courier: "Amazon Transportation", courierName: undefined })).toBe(true);
    expect(isAmazonTransportationOrder({ courier: "Ekart Standard 3Kg", courierName: "Ekart" })).toBe(false);
  });

  it("always uses Velocity PDF for Amazon Transportation (never ShipAmaze HTML)", () => {
    expect(
      shouldUseVelocityCourierPdf({
        courier: "Amazon Transportation",
        courierName: undefined,
      })
    ).toBe(true);
    expect(
      shouldUseVelocityCourierPdf({
        courier: "Amazon Transportation",
        courierName: "Amazon Transportation",
      })
    ).toBe(true);
    expect(
      shouldUseVelocityCourierPdf({
        courier: "Ekart Standard 3Kg",
        courierName: "Ekart",
      })
    ).toBe(false);
  });
});
