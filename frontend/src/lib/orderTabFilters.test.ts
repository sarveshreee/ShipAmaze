import { describe, expect, it } from "vitest";
import { isOrderReadyToShip, normalizeTabStatus, orderMatchesTab } from "./orderTabFilters";
import type { Order } from "@/types/logistics";

function orderWith(overrides: Partial<Order>): Order {
  return {
    id: "SA-1",
    customer: "Customer",
    phone: "9999999999",
    address: "Address",
    city: "City",
    pincode: "110001",
    weight: "0.5",
    courier: "Amazon Transportation",
    payment: "COD",
    status: "ready-to-ship",
    date: "2026-06-23",
    awb: "AWB123",
    amount: 699,
    products: [],
    ...overrides,
  };
}

describe("order tab filters", () => {
  it("normalizes status aliases from Velocity", () => {
    expect(normalizeTabStatus("In-Transit")).toBe("in_transit");
    expect(normalizeTabStatus("Out for Delivery")).toBe("out_for_delivery");
  });

  it("matches in-transit by shipmentStatus when main status is stale", () => {
    const order = orderWith({ status: "ready-to-ship", shipmentStatus: "In Transit" });

    expect(orderMatchesTab(order, "in-transit")).toBe(true);
    expect(orderMatchesTab(order, "delivered")).toBe(false);
  });

  it("matches delivered by shipmentStatus when main status is stale", () => {
    const order = orderWith({ status: "in-transit", shipmentStatus: "Delivered" });

    expect(orderMatchesTab(order, "delivered")).toBe(true);
    expect(orderMatchesTab(order, "in-transit")).toBe(false);
  });

  it("treats orders as ready to ship when only shipmentStatus was updated", () => {
    const order = orderWith({
      status: "pending",
      shipmentStatus: "ready_to_ship",
      awb: "",
    });

    expect(isOrderReadyToShip(order)).toBe(true);
    expect(orderMatchesTab(order, "ready-to-ship")).toBe(true);
  });

  it("normalizes ready-to-ship status aliases", () => {
    expect(isOrderReadyToShip(orderWith({ status: "ready-to-ship", awb: "" }))).toBe(true);
    expect(isOrderReadyToShip(orderWith({ status: "Ready to Ship" as Order["status"], awb: "" }))).toBe(true);
  });

  it("includes pending manual orders in manual tab", () => {
    const order = orderWith({
      status: "pending",
      channel: "Manual",
      awb: "",
      shipmentCreated: false,
    });

    expect(orderMatchesTab(order, "manual")).toBe(true);
    expect(orderMatchesTab(order, "ready-to-ship")).toBe(false);
  });

  it("excludes processed manual orders from manual tab", () => {
    const order = orderWith({
      status: "ready-to-ship",
      channel: "Manual",
      awb: "",
      shipmentCreated: false,
    });

    expect(orderMatchesTab(order, "manual")).toBe(false);
    expect(orderMatchesTab(order, "ready-to-ship")).toBe(true);
  });

  it("keeps channel and manual tabs limited to pre-fulfillment orders", () => {
    const order = orderWith({
      status: "pending",
      shipmentStatus: "In-Transit",
      awb: "AWB123",
      shipmentCreated: false,
    });

    expect(orderMatchesTab(order, "manual")).toBe(false);
    expect(orderMatchesTab(order, "channel")).toBe(false);
  });

  it("matches pending-pickup for ready_for_pickup shipmentStatus", () => {
    const order = orderWith({
      status: "pickup_scheduled",
      shipmentStatus: "ready_for_pickup",
      awb: "AWB123",
    });

    expect(orderMatchesTab(order, "pending-pickup")).toBe(true);
    expect(orderMatchesTab(order, "failed")).toBe(false);
    expect(orderMatchesTab(order, "in-transit")).toBe(false);
  });

  it("matches pending-pickup for not_picked shipmentStatus", () => {
    const order = orderWith({
      status: "pickup_scheduled",
      shipmentStatus: "not_picked",
      awb: "AWB123",
    });

    expect(orderMatchesTab(order, "pending-pickup")).toBe(true);
    expect(orderMatchesTab(order, "failed")).toBe(false);
    expect(orderMatchesTab(order, "in-transit")).toBe(false);
  });

  it("moves not_picked orders to in-transit when shipmentStatus advances", () => {
    const order = orderWith({
      status: "pickup_scheduled",
      shipmentStatus: "in_transit",
      awb: "AWB123",
    });

    expect(orderMatchesTab(order, "pending-pickup")).toBe(false);
    expect(orderMatchesTab(order, "in-transit")).toBe(true);
    expect(orderMatchesTab(order, "failed")).toBe(false);
  });
});
