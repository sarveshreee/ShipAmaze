import { describe, expect, it } from "vitest";
import { carrierMatchesSelection, courierNameMatches, orderDestPincode } from "./orderServiceabilityFilter";
import type { Order } from "@/types/logistics";

describe("orderServiceabilityFilter", () => {
  it("matches courier aliases", () => {
    expect(courierNameMatches("Ekart", "Ekart Standard")).toBe(true);
    expect(courierNameMatches("Ekart Standard", "Ekart")).toBe(true);
  });

  it("matches carriers by id or name", () => {
    expect(
      carrierMatchesSelection(
        { carrier_id: "12", carrier_name: "Ekart Standard" },
        { carrierId: "12" }
      )
    ).toBe(true);
    expect(
      carrierMatchesSelection(
        { carrier_id: "99", carrier_name: "Ekart Standard" },
        { courierName: "Ekart" }
      )
    ).toBe(true);
  });

  it("reads destination pincode from order fields", () => {
    const order = {
      id: "1",
      pincode: "110001",
      shippingPincode: "560001",
    } as Order;
    expect(orderDestPincode(order)).toBe("560001");
  });
});
