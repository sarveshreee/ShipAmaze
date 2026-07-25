import { describe, expect, it } from "vitest";
import { finalizeCourierOption, parseEstimatedDays } from "./normalizeCourierOption.js";

describe("normalizeCourierOption", () => {
  it("parses estimated days from TAT strings", () => {
    expect(parseEstimatedDays("2-4 days")).toBe(3);
    expect(parseEstimatedDays("3 days")).toBe(3);
    expect(parseEstimatedDays(2)).toBe(2);
  });

  it("finalizes shared fields and aliases", () => {
    const opt = finalizeCourierOption({
      provider: "velocity",
      courierId: "1",
      courierName: "Delhivery",
      freightCharge: 55,
      cod: true,
      tat: "1-2 days",
    });
    expect(opt).toMatchObject({
      serviceable: true,
      freight: 55,
      freightCharge: 55,
      codSupported: true,
      estimatedDays: 2,
    });
  });
});
