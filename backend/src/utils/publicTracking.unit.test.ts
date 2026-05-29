import { describe, it, expect } from "vitest";
import { mapToPublicTracking, maskPhone, maskPincode } from "./publicTracking.js";

describe("publicTracking", () => {
  it("masks phone and pincode", () => {
    expect(maskPhone("9876543210")).toBe("******3210");
    expect(maskPincode("110001")).toBe("11**01");
  });

  it("omits full address and pricing from public DTO", () => {
    const dto = mapToPublicTracking({
      orderId: "ORD-1",
      awb: "AWB123",
      status: "in-transit",
      customer: "Jane Doe",
      phone: "9876543210",
      address: "12 Secret Lane",
      city: "Delhi",
      state: "DL",
      pincode: "110001",
      payment: "COD ₹500",
      amount: 500,
      courier: "BlueDart",
      customerEmail: "jane@example.com",
      trackingActivities: [{ date: "2026-01-01", activity: "Picked up", location: "Hub" }],
    });

    expect(dto.id).toBe("ORD-1");
    expect(dto.customerPhoneMasked).toBe("******3210");
    expect(dto.city).toBe("Delhi");
    expect(dto.payment).toBe("COD");
    expect("customer" in dto).toBe(false);
    expect("address" in dto).toBe(false);
    expect("amount" in dto).toBe(false);
    expect("customerEmail" in dto).toBe(false);
  });
});
