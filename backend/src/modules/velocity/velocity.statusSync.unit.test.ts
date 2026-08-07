import { describe, expect, it } from "vitest";
import { mapVelocityStatus, shouldApplyInternalStatusUpdate } from "./velocity.mapper.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";

describe("velocity status sync mapping consistency", () => {
  it("normalizes mapped Velocity statuses to canonical DB form", () => {
    const cases = [
      ["In Transit", "in_transit"],
      ["out_for_delivery", "out_for_delivery"],
      ["OFD", "out_for_delivery"],
      ["Delivered", "delivered"],
      ["Booked", "ready_to_ship"],
      ["ndr_raised", "ndr"],
      ["Dispatched", "in_transit"],
      ["Connected", "in_transit"],
      ["Bagged", "in_transit"],
    ] as const;

    for (const [raw, canonical] of cases) {
      expect(normalizeOrderStatus(mapVelocityStatus(raw))).toBe(canonical);
    }
  });

  it("allows sync to advance from hyphenated legacy DB values", () => {
    expect(shouldApplyInternalStatusUpdate("in-transit", "out-for-delivery")).toBe(true);
    expect(shouldApplyInternalStatusUpdate("pickup-scheduled", "in_transit")).toBe(true);
    expect(shouldApplyInternalStatusUpdate("delivered", "in-transit")).toBe(false);
  });
});
