import { describe, expect, it } from "vitest";
import {
  classifyOrderTab,
  displayStatusLabel,
  normalizeTrackingStatus,
  orderMatchesTabCategory,
} from "./orderStatusClassifier.js";

describe("normalizeTrackingStatus", () => {
  it("normalizes Velocity PickupFailed", () => {
    expect(normalizeTrackingStatus("PickupFailed", "velocity")).toBe("pickup_failed");
    expect(normalizeTrackingStatus("Pickup Failed", "velocity")).toBe("pickup_failed");
  });

  it("normalizes Lorrigo PICKUP_FAILED", () => {
    expect(normalizeTrackingStatus("PICKUP_FAILED", "lorrigo")).toBe("pickup_failed");
  });

  it("maps NDR family to ndr", () => {
    expect(normalizeTrackingStatus("NDR", "velocity")).toBe("ndr");
    expect(normalizeTrackingStatus("Customer Refused", "velocity")).toBe("ndr");
    expect(normalizeTrackingStatus("Delivery Attempt Failed", "lorrigo")).toBe("ndr");
  });

  it("maps RTO family to rto", () => {
    expect(normalizeTrackingStatus("RTO Initiated", "velocity")).toBe("rto");
    expect(normalizeTrackingStatus("RTO Delivered", "velocity")).toBe("rto");
    expect(normalizeTrackingStatus("Return Received", "lorrigo")).toBe("rto");
  });

  it("maps booking failures to processing_failed", () => {
    expect(normalizeTrackingStatus("Booking Failed", "velocity")).toBe("booking_failed");
    expect(normalizeTrackingStatus("Label Generation Failed", "velocity")).toBe("label_generation_failed");
  });

  it("maps delivered", () => {
    expect(normalizeTrackingStatus("Delivered", "velocity")).toBe("delivered");
    expect(normalizeTrackingStatus("DELIVERED", "lorrigo")).toBe("delivered");
  });

  it("displayStatusLabel collapses delivered casing to one label", () => {
    expect(displayStatusLabel("delivered")).toBe("Delivered");
    expect(displayStatusLabel("DELIVERED")).toBe("Delivered");
    expect(displayStatusLabel("Delivered")).toBe("Delivered");
  });

  it("maps Lorrigo OUT_FOR_PICKUP to pending_pickup", () => {
    expect(normalizeTrackingStatus("OUT_FOR_PICKUP", "lorrigo")).toBe("pending_pickup");
    expect(normalizeTrackingStatus("Out For Pickup", "lorrigo")).toBe("pending_pickup");
  });

  it("maps Ekart create-stage statuses to pending_pickup, not in_transit", () => {
    expect(normalizeTrackingStatus("shipment_created", "ekart")).toBe("pending_pickup");
    expect(normalizeTrackingStatus("REQUEST_RECEIVED", "ekart")).toBe("pending_pickup");
    expect(normalizeTrackingStatus("Shipment Details Received", "ekart")).toBe("pending_pickup");
    expect(
      classifyOrderTab({
        status: "pickup_scheduled",
        shipmentStatus: "shipment_created",
        awb: "TECC9944456948",
        courierProvider: "ekart",
      })
    ).toBe("pending_pickup");
  });

  it("maps Ekart pickup_complete to in_transit", () => {
    expect(normalizeTrackingStatus("pickup_complete", "ekart")).toBe("in_transit");
    expect(
      classifyOrderTab({
        status: "picked_up",
        shipmentStatus: "pickup_complete",
        awb: "TECC9944456948",
        courierProvider: "ekart",
      })
    ).toBe("in_transit");
  });

  it("Ekart picked-up status wins over stale shipment_created", () => {
    expect(
      classifyOrderTab({
        status: "in_transit",
        shipmentStatus: "shipment_created",
        awb: "TECC9944456948",
        courierProvider: "ekart",
      })
    ).toBe("in_transit");
    expect(
      classifyOrderTab({
        status: "picked_up",
        shipmentStatus: "pending_pickup",
        awb: "TECC9944456948",
        courierProvider: "ekart",
      })
    ).toBe("in_transit");
  });

  it("Ekart Shipment Expected goes to in_transit tab", () => {
    expect(normalizeTrackingStatus("Shipment Expected", "ekart")).toBe("in_transit");
    expect(normalizeTrackingStatus("expected", "ekart")).toBe("in_transit");
    expect(
      classifyOrderTab({
        status: "pending_pickup",
        shipmentStatus: "Shipment Expected",
        awb: "FICC8789452240",
        courierProvider: "ekart",
      })
    ).toBe("in_transit");
    expect(
      orderMatchesTabCategory(
        {
          status: "pending_pickup",
          shipmentStatus: "Shipment Expected",
          awb: "FICC8789452240",
          courierProvider: "ekart",
        },
        "in-transit"
      )
    ).toBe(true);
    expect(
      orderMatchesTabCategory(
        {
          status: "pending_pickup",
          shipmentStatus: "Shipment Expected",
          awb: "FICC8789452240",
          courierProvider: "ekart",
        },
        "pending-pickup"
      )
    ).toBe(false);
  });
});

describe("classifyOrderTab", () => {
  it("PickupFailed in shipmentStatus is failed, not ready_to_ship", () => {
    expect(
      classifyOrderTab({
        status: "ready_to_ship",
        shipmentStatus: "PickupFailed",
        awb: "",
      })
    ).toBe("failed");
  });

  it("ready_to_ship without AWB stays ready_to_ship", () => {
    expect(
      classifyOrderTab({
        status: "ready_to_ship",
        shipmentStatus: "Booked",
        awb: "",
      })
    ).toBe("ready_to_ship");
  });

  it("NDR statuses go to ndr tab", () => {
    expect(classifyOrderTab({ status: "in_transit", shipmentStatus: "NDR" })).toBe("ndr");
    expect(classifyOrderTab({ status: "ndr", shipmentStatus: "Customer Refused" })).toBe("ndr");
  });

  it("RTO statuses go to rto tab", () => {
    expect(classifyOrderTab({ status: "in_transit", shipmentStatus: "RTO Initiated" })).toBe("rto");
  });

  it("processing failures go to failed tab only", () => {
    expect(classifyOrderTab({ status: "pickup_failed", shipmentStatus: "PickupFailed" })).toBe("failed");
    expect(classifyOrderTab({ status: "booking_failed", shipmentStatus: "Booking Failed" })).toBe("failed");
  });

  it("Lorrigo OUT_FOR_PICKUP goes to pending_pickup even when status is in_transit", () => {
    expect(
      classifyOrderTab({
        status: "in_transit",
        shipmentStatus: "OUT_FOR_PICKUP",
        awb: "39598663514731",
        courierProvider: "lorrigo",
      })
    ).toBe("pending_pickup");
  });

  it("Lorrigo PICKUP_EXCEPTION goes to pending_pickup with pickup exception status", () => {
    expect(normalizeTrackingStatus("PICKUP_EXCEPTION", "lorrigo")).toBe("pickup_exception");
    expect(
      classifyOrderTab({
        status: "in_transit",
        shipmentStatus: "PICKUP_EXCEPTION",
        awb: "39598662811500",
        courierProvider: "lorrigo",
      })
    ).toBe("pending_pickup");
    expect(
      orderMatchesTabCategory(
        {
          status: "pickup_failed",
          shipmentStatus: "PICKUP_EXCEPTION",
          awb: "39598662811500",
          courierProvider: "lorrigo",
        },
        "pending-pickup"
      )
    ).toBe(true);
    expect(
      orderMatchesTabCategory(
        {
          status: "pickup_failed",
          shipmentStatus: "PICKUP_EXCEPTION",
          awb: "39598662811500",
          courierProvider: "lorrigo",
        },
        "failed"
      )
    ).toBe(false);
  });
});

describe("orderMatchesTabCategory", () => {
  it("failed tab excludes NDR", () => {
    expect(
      orderMatchesTabCategory({ status: "ndr", shipmentStatus: "Customer Refused" }, "failed")
    ).toBe(false);
    expect(
      orderMatchesTabCategory({ status: "ndr", shipmentStatus: "Customer Refused" }, "ndr")
    ).toBe(true);
  });

  it("ready-to-ship excludes PickupFailed", () => {
    expect(
      orderMatchesTabCategory({
        status: "ready_to_ship",
        shipmentStatus: "PickupFailed",
        awb: "",
      }, "ready-to-ship")
    ).toBe(false);
  });
});
