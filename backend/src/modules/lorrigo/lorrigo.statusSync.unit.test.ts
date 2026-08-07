import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCourierProviderRegistryForTests,
  registerCourierProvider,
} from "../courier/providerRegistry.js";
import { LORRIGO_CAPABILITIES } from "../courier/capabilities.js";
import type { CourierProvider } from "../courier/CourierProvider.js";
import { resetLorrigoStatusSyncMetricsForTests } from "./lorrigo.statusSyncMetrics.js";

const orders: Array<Record<string, unknown>> = [];

vi.mock("../../models/Order.js", () => {
  return {
    Order: {
      find: vi.fn(() => ({
        select: vi.fn(() => ({
          sort: vi.fn(() => ({
            limit: vi.fn(() => ({
              exec: vi.fn(async () => orders),
            })),
          })),
        })),
      })),
      updateOne: vi.fn(async () => ({})),
      countDocuments: vi.fn(async () => orders.length),
    },
  };
});

function makeOrder(overrides: Record<string, unknown> = {}) {
  const o = {
    _id: "507f1f77bcf86cd799439011",
    orderId: "ORD-SYNC-1",
    awb: "AWB1",
    status: "in_transit",
    shipmentStatus: "In Transit",
    trackingActivities: [],
    statusHistory: [],
    providerEvents: [] as unknown[],
    correlationId: "corr-1",
    courierProvider: "lorrigo",
    markModified: vi.fn(),
    save: vi.fn(async function (this: unknown) {
      return this;
    }),
    ...overrides,
  };
  return o;
}

function makeProvider(track: CourierProvider["trackShipment"]): CourierProvider {
  return {
    id: "lorrigo",
    displayName: "Lorrigo",
    capabilities: { ...LORRIGO_CAPABILITIES, tracking: true },
    isConfigured: () => true,
    authenticate: async () => undefined,
    serviceability: async () => [],
    getRates: async () => [],
    createPickup: async () => ({ pickupId: "p" }),
    createShipment: async () => ({ providerOrderId: "o", awb: "a" }),
    cancelShipment: async () => ({ success: true }),
    trackShipment: track,
    getShipment: async () => ({ providerOrderId: "o", awb: "a" }),
    syncStatus: async () => ({}),
    supportsNDR: () => false,
    fetchNDR: async () => [],
    performNDRAction: async () => ({ success: false }),
    syncNDR: async () => ({}),
  };
}

describe("lorrigo status sync", () => {
  beforeEach(() => {
    clearCourierProviderRegistryForTests();
    resetLorrigoStatusSyncMetricsForTests();
    orders.length = 0;
    process.env.LORRIGO_ENABLED = "true";
    process.env.LORRIGO_EMAIL = "a@b.com";
    process.env.LORRIGO_PASSWORD = "x";
    vi.clearAllMocks();
  });

  it("applies status change and appends timeline once", async () => {
    const order = makeOrder({ status: "picked_up" });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "AWB1",
        status: "Out for Delivery",
        activities: [{ date: "d", activity: "OFD", location: "Mumbai" }],
      }))
    );

    const { syncLorrigoActiveShipmentStatuses } = await import("./lorrigo.statusSync.js");
    const r = await syncLorrigoActiveShipmentStatuses(10);

    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("out_for_delivery");
    expect(order.providerEvents.some((e: { type: string }) => e.type === "STATUS_CHANGE")).toBe(
      true
    );
    expect(order.trackingActivities).toHaveLength(1);
  });

  it("suppresses duplicate timeline entries for same status", async () => {
    const order = makeOrder({ status: "in_transit", shipmentStatus: "In Transit" });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "AWB1",
        status: "In Transit",
        activities: [],
      }))
    );

    const { syncLorrigoActiveShipmentStatuses } = await import("./lorrigo.statusSync.js");
    await syncLorrigoActiveShipmentStatuses(10);
    await syncLorrigoActiveShipmentStatuses(10);

    const statusChanges = (order.providerEvents as { type: string }[]).filter(
      (e) => e.type === "STATUS_CHANGE"
    );
    expect(statusChanges).toHaveLength(0);
    expect(order.lastProviderStatusSyncedAt).toBeInstanceOf(Date);
  });

  it("records tracking failure without throwing the batch", async () => {
    const order = makeOrder();
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => {
        throw new Error("timeout");
      })
    );

    const { syncLorrigoActiveShipmentStatuses } = await import("./lorrigo.statusSync.js");
    const r = await syncLorrigoActiveShipmentStatuses(10);
    expect(r.errors).toBe(1);
    expect(
      (order.providerEvents as { type: string }[]).some((e) => e.type === "TRACKING_FAILED")
    ).toBe(true);
  });

  it("moves Lorrigo-cancelled shipments to reship and clears AWB", async () => {
    const order = makeOrder({
      status: "pending_pickup",
      shipmentStatus: "PICKUP_SCHEDULED",
      shipmentCreated: true,
      lorrigoOrderId: "lo-1",
      awb: "AWB-CANCEL",
    });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "AWB-CANCEL",
        status: "Cancelled",
        activities: [],
      }))
    );

    const { syncLorrigoActiveShipmentStatuses } = await import("./lorrigo.statusSync.js");
    const r = await syncLorrigoActiveShipmentStatuses(10);

    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("reship");
    expect(order.shipmentStatus).toBe("reship");
    expect(order.awb).toBe("");
    expect(order.shipmentCreated).toBe(false);
    expect(order.lorrigoOrderId).toBeUndefined();
  });

  it("heals CANCELLED_ORDER stuck under in_transit into reship", async () => {
    const order = makeOrder({
      status: "in_transit",
      shipmentStatus: "CANCELLED_ORDER",
      shipmentCreated: true,
      lorrigoOrderId: "lo-stuck",
      awb: "AWB-STUCK",
    });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => {
        throw new Error("should not track when already cancelled locally");
      })
    );

    const { syncLorrigoActiveShipmentStatuses } = await import("./lorrigo.statusSync.js");
    const r = await syncLorrigoActiveShipmentStatuses(10);

    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("reship");
    expect(order.shipmentStatus).toBe("reship");
    expect(order.awb).toBe("");
  });

  it("heals mis-mapped OUT_FOR_PICKUP from in_transit to pickup_scheduled", async () => {
    const order = makeOrder({
      status: "in_transit",
      shipmentStatus: "OUT_FOR_PICKUP",
      shipmentCreated: true,
      lorrigoOrderId: "lo-pickup",
      awb: "AWB-PICKUP",
    });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "AWB-PICKUP",
        status: "OUT_FOR_PICKUP",
        activities: [],
      }))
    );

    const { syncLorrigoActiveShipmentStatuses } = await import("./lorrigo.statusSync.js");
    const r = await syncLorrigoActiveShipmentStatuses(10);

    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("pickup_scheduled");
    expect(order.shipmentStatus).toBe("OUT_FOR_PICKUP");
  });

  it("heals PICKUP_EXCEPTION from in_transit to pickup_scheduled", async () => {
    const order = makeOrder({
      status: "in_transit",
      shipmentStatus: "PICKUP_EXCEPTION",
      shipmentCreated: true,
      lorrigoOrderId: "lo-exception",
      awb: "AWB-EXCEPTION",
    });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "AWB-EXCEPTION",
        status: "PICKUP_EXCEPTION",
        activities: [],
      }))
    );

    const { syncLorrigoActiveShipmentStatuses } = await import("./lorrigo.statusSync.js");
    const r = await syncLorrigoActiveShipmentStatuses(10);

    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("pickup_scheduled");
    expect(order.shipmentStatus).toBe("PICKUP_EXCEPTION");
  });

  it("heals PICKUP_EXCEPTION from pickup_failed to pickup_scheduled", async () => {
    const order = makeOrder({
      status: "pickup_failed",
      shipmentStatus: "PICKUP_EXCEPTION",
      shipmentCreated: true,
      lorrigoOrderId: "lo-exception-2",
      awb: "AWB-EXCEPTION-2",
    });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "AWB-EXCEPTION-2",
        status: "PICKUP_EXCEPTION",
        activities: [],
      }))
    );

    const { syncLorrigoActiveShipmentStatuses } = await import("./lorrigo.statusSync.js");
    const r = await syncLorrigoActiveShipmentStatuses(10);

    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("pickup_scheduled");
    expect(order.shipmentStatus).toBe("PICKUP_EXCEPTION");
  });
});
