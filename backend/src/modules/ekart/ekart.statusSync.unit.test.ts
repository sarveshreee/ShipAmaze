import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCourierProviderRegistryForTests,
  registerCourierProvider,
} from "../courier/providerRegistry.js";
import { EKART_CAPABILITIES } from "../courier/capabilities.js";
import type { CourierProvider } from "../courier/CourierProvider.js";
import { resetEkartStatusSyncMetricsForTests } from "./ekart.statusSyncMetrics.js";
import { getEkartStatusSyncHealth } from "./ekart.statusSyncMetrics.js";

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
  return {
    _id: "507f1f77bcf86cd799439011",
    orderId: "ORD-EKART-1",
    awb: "TECP0000000001",
    status: "in_transit",
    shipmentStatus: "in_transit",
    trackingActivities: [],
    statusHistory: [],
    providerEvents: [] as unknown[],
    correlationId: "corr-ekart-1",
    courierProvider: "ekart",
    markModified: vi.fn(),
    save: vi.fn(async function (this: unknown) {
      return this;
    }),
    ...overrides,
  };
}

function makeProvider(track: CourierProvider["trackShipment"]): CourierProvider {
  return {
    id: "ekart",
    displayName: "Ekart",
    capabilities: { ...EKART_CAPABILITIES, tracking: true },
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

describe("ekart status sync", () => {
  beforeEach(() => {
    clearCourierProviderRegistryForTests();
    resetEkartStatusSyncMetricsForTests();
    orders.length = 0;
    process.env.EKART_ENABLED = "true";
    process.env.EKART_AUTHORIZATION = "Basic dGVzdA==";
    process.env.EKART_MERCHANT_CODE = "TEC";
    vi.clearAllMocks();
  });

  it("applies status change and appends timeline once", async () => {
    const order = makeOrder({ status: "picked_up" });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "TECP0000000001",
        status: "out_for_delivery",
        activities: [{ date: "d", activity: "Out for delivery", location: "Hub" }],
      }))
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    const r = await syncEkartActiveShipmentStatuses(10);

    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("out_for_delivery");
    expect(
      (order.providerEvents as { type: string }[]).some((e) => e.type === "STATUS_CHANGE")
    ).toBe(true);
    expect(order.trackingActivities).toHaveLength(1);
  });

  it("suppresses duplicate timeline entries for same status", async () => {
    const order = makeOrder({ status: "in_transit", shipmentStatus: "in_transit" });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "TECP0000000001",
        status: "in_transit",
        activities: [],
      }))
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    await syncEkartActiveShipmentStatuses(10);
    await syncEkartActiveShipmentStatuses(10);

    const statusChanges = (order.providerEvents as { type: string }[]).filter(
      (e) => e.type === "STATUS_CHANGE"
    );
    expect(statusChanges).toHaveLength(0);
    expect(order.lastProviderStatusSyncedAt).toBeInstanceOf(Date);
  });

  it("moves Elite/Durin cancelled shipments to reship and clears AWB", async () => {
    const order = makeOrder({ status: "pickup_scheduled", shipmentStatus: "pickup_scheduled" });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "TECP0000000001",
        status: "pickup_cancelled",
        activities: [{ date: "d", activity: "Pickup Cancelled", location: "SURAT" }],
      }))
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    const r = await syncEkartActiveShipmentStatuses(10);
    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("reship");
    expect(order.shipmentStatus).toBe("reship");
    expect(order.awb).toBe("");
    expect(order.shipmentCreated).toBe(false);
  });

  it("heals false in_transit when Durin is still at shipment_created", async () => {
    const order = makeOrder({ status: "in_transit", shipmentStatus: "in_transit" });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "TECP0000000001",
        status: "shipment_created",
        activities: [{ date: "d", activity: "Shipment Created", location: "SURAT" }],
      }))
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    const r = await syncEkartActiveShipmentStatuses(10);
    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("pickup_scheduled");
    expect(order.shipmentStatus).toBe("shipment_created");
  });

  it("advances pending_pickup to in_transit on pickup_complete", async () => {
    const order = makeOrder({ status: "pending_pickup", shipmentStatus: "shipment_created" });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "TECP0000000001",
        status: "pickup_complete",
        pickupDate: "2018-08-21T12:00:00.000+05:30",
        activities: [{ date: "d", activity: "Shipment Picked Up", location: "SURAT" }],
      }))
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    const r = await syncEkartActiveShipmentStatuses(10);
    expect(r.statusChanges).toBe(1);
    expect(["picked_up", "in_transit"]).toContain(order.status);
    expect(["pickup_complete", "in_transit", "picked_up"]).toContain(order.shipmentStatus);
  });

  it("does not heal in_transit back when activities already show pickup", async () => {
    const order = makeOrder({ status: "in_transit", shipmentStatus: "in_transit" });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "TECP0000000001",
        status: "shipment_created",
        activities: [
          { date: "d2", activity: "Shipment Picked Up", location: "SURAT" },
          { date: "d1", activity: "Shipment Created", location: "SURAT" },
        ],
      }))
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    const r = await syncEkartActiveShipmentStatuses(10);
    expect(r.statusChanges).toBe(0);
    expect(order.status).toBe("in_transit");
  });

  it("heals false delivered when Durin latest is undelivered_attempted", async () => {
    const order = makeOrder({ status: "delivered", shipmentStatus: "delivered" });
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "TECP0000000001",
        status: "undelivered_attempted",
        activities: [
          { date: "d", activity: "Undelivered - Customer not available", location: "Hub" },
        ],
      }))
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    const r = await syncEkartActiveShipmentStatuses(10);
    expect(r.statusChanges).toBe(1);
    expect(order.status).toBe("ndr");
    expect(["undelivered_attempted", "ndr"]).toContain(order.shipmentStatus);
  });

  it("records tracking failure without throwing the batch", async () => {
    const order = makeOrder();
    orders.push(order);
    registerCourierProvider(
      makeProvider(async () => {
        throw new Error("timeout");
      })
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    const r = await syncEkartActiveShipmentStatuses(10);
    expect(r.errors).toBe(1);
    expect(
      (order.providerEvents as { type: string }[]).some((e) => e.type === "TRACKING_FAILED")
    ).toBe(true);
  });

  it("no-ops when EKART_ENABLED is false", async () => {
    process.env.EKART_ENABLED = "false";
    orders.push(makeOrder());
    registerCourierProvider(
      makeProvider(async () => {
        throw new Error("should not track when disabled");
      })
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    const r = await syncEkartActiveShipmentStatuses(10);
    expect(r.processed).toBe(0);
    expect(r.updated).toBe(0);
  });

  it("records poll health metrics on success", async () => {
    orders.push(makeOrder({ status: "picked_up" }));
    registerCourierProvider(
      makeProvider(async () => ({
        awb: "TECP0000000001",
        status: "in_transit",
        activities: [],
      }))
    );

    const { syncEkartActiveShipmentStatuses } = await import("./ekart.statusSync.js");
    await syncEkartActiveShipmentStatuses(10);

    const health = getEkartStatusSyncHealth();
    expect(health.polls).toBe(1);
    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastSuccessfulSyncAt).toBeTruthy();
    expect(health.activeShipments).toBe(1);
  });
});
