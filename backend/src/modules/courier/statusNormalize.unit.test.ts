import { describe, expect, it } from "vitest";
import {
  mapLorrigoStatusToProviderCanonical,
  providerCanonicalToOrderStatus,
  shouldApplyStatusUpdate,
} from "./statusNormalize.js";

describe("statusNormalize", () => {
  it("maps Lorrigo raw statuses to provider canonical + order status", () => {
    expect(mapLorrigoStatusToProviderCanonical("In Transit")).toBe("IN_TRANSIT");
    expect(providerCanonicalToOrderStatus("IN_TRANSIT")).toBe("in_transit");
    expect(mapLorrigoStatusToProviderCanonical("OFD")).toBe("OUT_FOR_DELIVERY");
    expect(providerCanonicalToOrderStatus("DELIVERED")).toBe("delivered");
    expect(providerCanonicalToOrderStatus("RETURNED")).toBe("rto");
    expect(providerCanonicalToOrderStatus("FAILED")).toBe("ndr");
    expect(providerCanonicalToOrderStatus("LOST")).toBe("cancelled");
  });

  it("suppresses regression from delivered", () => {
    expect(shouldApplyStatusUpdate("delivered", "in_transit")).toBe(false);
    expect(shouldApplyStatusUpdate("in_transit", "out_for_delivery")).toBe(true);
  });
});
