import { describe, expect, it } from "vitest";
import {
  internalShipmentProgressRank,
  mapVelocityStatus,
  shouldApplyInternalStatusUpdate,
  velocityStatusLabel,
} from "./velocity.mapper.js";

describe("velocity status mapping", () => {
  it("maps Velocity status aliases with spaces and hyphens", () => {
    expect(mapVelocityStatus("In Transit")).toBe("in-transit");
    expect(mapVelocityStatus("In-Transit")).toBe("in-transit");
    expect(mapVelocityStatus("Out for Delivery")).toBe("out-for-delivery");
    expect(mapVelocityStatus("Delivered")).toBe("delivered");
  });

  it("labels Velocity status aliases with spaces and hyphens", () => {
    expect(velocityStatusLabel("In-Transit")).toBe("In Transit");
    expect(velocityStatusLabel("Out for Delivery")).toBe("Out for Delivery");
  });

  it("ranks canonical underscore statuses in shipment order", () => {
    expect(internalShipmentProgressRank("pickup_scheduled")).toBeLessThan(
      internalShipmentProgressRank("in_transit")
    );
    expect(internalShipmentProgressRank("in_transit")).toBeLessThan(
      internalShipmentProgressRank("out_for_delivery")
    );
    expect(internalShipmentProgressRank("out_for_delivery")).toBeLessThan(
      internalShipmentProgressRank("delivered")
    );
  });

  it("allows forward progress across all order sections", () => {
    expect(shouldApplyInternalStatusUpdate("pickup_scheduled", "in_transit")).toBe(true);
    expect(shouldApplyInternalStatusUpdate("in_transit", "out_for_delivery")).toBe(true);
    expect(shouldApplyInternalStatusUpdate("out_for_delivery", "delivered")).toBe(true);
    expect(shouldApplyInternalStatusUpdate("delivered", "in_transit")).toBe(false);
  });

  it("maps compact and booking aliases used by Velocity", () => {
    expect(mapVelocityStatus("OFD")).toBe("out-for-delivery");
    expect(mapVelocityStatus("outfordelivery")).toBe("out-for-delivery");
    expect(mapVelocityStatus("intransit")).toBe("in-transit");
    expect(mapVelocityStatus("Booked")).toBe("pickup-scheduled");
    expect(mapVelocityStatus("Manifested")).toBe("pickup-scheduled");
  });
});
