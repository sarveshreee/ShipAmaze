import { describe, expect, it } from "vitest";
import { isAmazonTransportationOrder, shouldUseVelocityCourierPdf } from "./labelPrintUtils";

describe("labelPrintUtils", () => {
  it("detects Amazon Transportation couriers", () => {
    expect(isAmazonTransportationOrder({ courier: "Amazon Transportation", courierName: undefined })).toBe(true);
    expect(isAmazonTransportationOrder({ courier: "Ekart Standard 3Kg", courierName: "Ekart" })).toBe(false);
  });

  it("uses Velocity PDF only for Amazon orders with AWB", () => {
    expect(
      shouldUseVelocityCourierPdf({
        id: "x",
        courier: "Amazon Transportation",
        awb: "370400004350",
      } as never)
    ).toBe(true);
    expect(
      shouldUseVelocityCourierPdf({
        id: "x",
        courier: "Ekart Standard 3Kg",
        awb: "MJHC1799065953",
      } as never)
    ).toBe(false);
  });
});
