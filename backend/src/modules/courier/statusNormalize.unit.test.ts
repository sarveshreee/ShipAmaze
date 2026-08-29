import { describe, expect, it } from "vitest";
import {
  mapLorrigoStatusToProviderCanonical,
  mapEkartStatusToProviderCanonical,
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
    expect(mapLorrigoStatusToProviderCanonical("CANCELLED_ORDER")).toBe("CANCELLED");
    expect(mapLorrigoStatusToProviderCanonical("cancelled_order")).toBe("CANCELLED");
    expect(mapLorrigoStatusToProviderCanonical("OUT_FOR_PICKUP")).toBe("CREATED");
    expect(mapLorrigoStatusToProviderCanonical("PICKUP_EXCEPTION")).toBe("CREATED");
    expect(providerCanonicalToOrderStatus("CREATED")).toBe("pickup_scheduled");
  });

  it("maps Durin create-stage statuses to CREATED, not IN_TRANSIT", () => {
    expect(mapEkartStatusToProviderCanonical("shipment_created")).toBe("CREATED");
    expect(mapEkartStatusToProviderCanonical("REQUEST_RECEIVED")).toBe("CREATED");
    expect(mapEkartStatusToProviderCanonical("Shipment Details Received")).toBe("CREATED");
    expect(mapEkartStatusToProviderCanonical("Shipment Created")).toBe("CREATED");
    expect(providerCanonicalToOrderStatus("CREATED")).toBe("pickup_scheduled");
  });

  it("maps Ekart pickup confirmations to PICKED_UP / IN_TRANSIT", () => {
    expect(mapEkartStatusToProviderCanonical("pickup_complete")).toBe("PICKED_UP");
    expect(mapEkartStatusToProviderCanonical("Shipment Picked Up")).toBe("PICKED_UP");
    expect(mapEkartStatusToProviderCanonical("package_picked_up")).toBe("PICKED_UP");
    expect(mapEkartStatusToProviderCanonical("mh_received")).toBe("IN_TRANSIT");
    expect(providerCanonicalToOrderStatus("PICKED_UP")).toBe("picked_up");
  });

  it("maps Ekart Shipment Expected to IN_TRANSIT", () => {
    expect(mapEkartStatusToProviderCanonical("expected")).toBe("IN_TRANSIT");
    expect(mapEkartStatusToProviderCanonical("Shipment Expected")).toBe("IN_TRANSIT");
    expect(mapEkartStatusToProviderCanonical("shipment_expected")).toBe("IN_TRANSIT");
    expect(providerCanonicalToOrderStatus("IN_TRANSIT")).toBe("in_transit");
  });

  it("does not map undelivered / attempt statuses to DELIVERED", () => {
    expect(mapEkartStatusToProviderCanonical("undelivered_attempted")).toBe("FAILED");
    expect(mapEkartStatusToProviderCanonical("undelivered_unattempted")).toBe("FAILED");
    expect(mapEkartStatusToProviderCanonical("Undelivered - Customer not available")).toBe(
      "FAILED"
    );
    expect(mapEkartStatusToProviderCanonical("delivery_attempt_metadata")).toBe("FAILED");
    expect(mapEkartStatusToProviderCanonical("return_delivered")).toBe("RETURNED");
    expect(mapEkartStatusToProviderCanonical("delivered")).toBe("DELIVERED");
  });
});
