import mongoose from "mongoose";
import { shopifyOrderNeedsDefaultPickup } from "./shopifyOrderPickup.js";

describe("shopifyOrderNeedsDefaultPickup", () => {
  it("needs pickup when nothing set", () => {
    expect(shopifyOrderNeedsDefaultPickup({})).toBe(true);
    expect(shopifyOrderNeedsDefaultPickup({ pickupAddress: undefined })).toBe(true);
  });

  it("does not need when pickupAddressId is set", () => {
    const id = new mongoose.Types.ObjectId();
    expect(shopifyOrderNeedsDefaultPickup({ pickupAddressId: id })).toBe(false);
  });

  it("does not need when string label is non-empty", () => {
    expect(shopifyOrderNeedsDefaultPickup({ pickupAddress: "Warehouse A" })).toBe(false);
  });

  it("needs when string pickup is blank", () => {
    expect(shopifyOrderNeedsDefaultPickup({ pickupAddress: "   " })).toBe(true);
  });

  it("does not need when object has label", () => {
    expect(shopifyOrderNeedsDefaultPickup({ pickupAddress: { label: "Main" } })).toBe(false);
  });

  it("does not need when object has velocityWarehouseId only", () => {
    expect(shopifyOrderNeedsDefaultPickup({ pickupAddress: { velocityWarehouseId: "WH1" } })).toBe(false);
  });

  it("does not need when pincode and city look complete", () => {
    expect(
      shopifyOrderNeedsDefaultPickup({
        pickupAddress: { city: "Mumbai", pincode: "400001" },
      })
    ).toBe(false);
  });

  it("needs when object is empty", () => {
    expect(shopifyOrderNeedsDefaultPickup({ pickupAddress: {} })).toBe(true);
  });
});
