import { describe, expect, it } from "vitest";
import { normalizeTabStatus, orderMatchesTab } from "./orderTabFilters";
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

  it("keeps channel and manual tabs limited to pre-fulfillment orders", () => {
    const order = orderWith({
      status: "pending",
      shipmentStatus: "In-Transit",
      awb: "",
      shipmentCreated: false,
    });

    expect(orderMatchesTab(order, "manual")).toBe(false);
    expect(orderMatchesTab(order, "channel")).toBe(false);
  });
});
