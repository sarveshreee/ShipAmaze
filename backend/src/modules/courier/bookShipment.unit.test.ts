import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../middleware/errorMiddleware.js";
import {
  clearCourierProviderRegistryForTests,
  registerCourierProvider,
} from "./providerRegistry.js";
import { LORRIGO_CAPABILITIES } from "./capabilities.js";
import type { CourierProvider } from "./CourierProvider.js";
import { resetLorrigoBookingMetricsForTests } from "../lorrigo/lorrigo.bookingMetrics.js";

const pickupLean = {
  label: "WH",
  contactName: "Bob",
  phone: "9999999999",
  addressLine1: "Pickup Street",
  city: "Delhi",
  state: "DL",
  pincode: "110085",
  country: "India",
  lorrigoPickupId: "lp-1",
  lorrigoSyncStatus: "SUCCESS",
};

vi.mock("../../models/Pickup.js", () => ({
  Pickup: {
    findById: vi.fn(() => ({
      lean: vi.fn(async () => pickupLean),
    })),
  },
}));

vi.mock("../../models/Order.js", async () => {
  const actual = await vi.importActual<typeof import("../../models/Order.js")>(
    "../../models/Order.js"
  );
  return {
    ...actual,
    Order: Object.assign(actual.Order, {
      updateOne: vi.fn(async () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 })),
    }),
  };
});

vi.mock("./discoverCouriers.js", () => ({
  discoverServiceability: vi.fn(async () => ({
    couriers: [
      {
        provider: "lorrigo",
        courierId: "c1",
        courierName: "Lorrigo Express",
        serviceable: true,
      },
    ],
    providers: [],
    metrics: {
      totalLatencyMs: 1,
      cacheHits: 0,
      cacheMisses: 0,
      providerFailures: 0,
      providerTimeouts: 0,
      courierCount: 1,
    },
  })),
}));

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "ORD-1",
    shipmentCreated: false,
    awb: "",
    payment: "Prepaid",
    amount: 250,
    customer: "Ada Lovelace",
    phone: "9876543210",
    customerPhone: "9876543210",
    address: "Dest Street",
    shippingAddress1: "Dest Street",
    city: "Mumbai",
    shippingCity: "Mumbai",
    state: "MH",
    shippingState: "MH",
    pincode: "400001",
    shippingPincode: "400001",
    products: [{ name: "Item", qty: 1, price: 250, sku: "SKU1" }],
    statusHistory: [],
    status: "ready_to_ship",
    save: vi.fn(async function (this: unknown) {
      return this;
    }),
    ...overrides,
  };
}

function makeProvider(createImpl: CourierProvider["createShipment"]): CourierProvider {
  return {
    id: "lorrigo",
    displayName: "Lorrigo",
    capabilities: LORRIGO_CAPABILITIES,
    isConfigured: () => true,
    authenticate: async () => undefined,
    serviceability: async () => [],
    getRates: async () => [],
    createPickup: async () => ({ pickupId: "p" }),
    createShipment: createImpl,
    cancelShipment: async () => ({ success: true }),
    trackShipment: async () => ({ awb: "a", status: "x", activities: [] }),
    getShipment: async () => ({ providerOrderId: "o", awb: "a" }),
    syncStatus: async () => ({}),
    supportsNDR: () => false,
    fetchNDR: async () => [],
    performNDRAction: async () => ({ success: false }),
    syncNDR: async () => ({}),
  };
}

describe("bookLorrigoShipment", () => {
  beforeEach(() => {
    clearCourierProviderRegistryForTests();
    resetLorrigoBookingMetricsForTests();
    vi.clearAllMocks();
    process.env.LORRIGO_ENABLED = "true";
  });

  it("books successfully and persists AWB", async () => {
    const create = vi.fn(async () => ({
      providerOrderId: "lo-1",
      providerShipmentId: "ls-1",
      awb: "AWB111",
      courierId: "c1",
      courierName: "Lorrigo Express",
      labelUrl: "https://cdn.example/label.pdf",
      freightCharge: 55,
      status: "booked",
      raw: { ok: true },
    }));
    registerCourierProvider(makeProvider(create));
    const { bookLorrigoShipment } = await import("./bookShipment.js");
    const order = makeOrder() as unknown as import("../../models/Order.js").IOrder;

    const result = await bookLorrigoShipment({
      order,
      provider: "lorrigo",
      pickupAddressId: "507f1f77bcf86cd799439011",
      courierId: "c1",
      courierName: "Lorrigo Express",
      weightKg: 0.5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      skipServiceability: true,
    });

    expect(result.awb).toBe("AWB111");
    expect(create).toHaveBeenCalledTimes(1);
    expect(order.awb).toBe("AWB111");
    expect(order.shipmentCreated).toBe(true);
    expect(order.lorrigoOrderId).toBe("lo-1");
    expect(order.labelUrl).toContain("label.pdf");
    expect(order.save).toHaveBeenCalled();
  });

  it("blocks duplicate booking", async () => {
    const create = vi.fn(async () => ({ providerOrderId: "o", awb: "X" }));
    registerCourierProvider(makeProvider(create));
    const { bookLorrigoShipment } = await import("./bookShipment.js");
    const order = makeOrder({ shipmentCreated: true, awb: "EXISTING" }) as unknown as import("../../models/Order.js").IOrder;

    await expect(
      bookLorrigoShipment({
        order,
        provider: "lorrigo",
        pickupAddressId: "507f1f77bcf86cd799439011",
        courierId: "c1",
        weightKg: 0.5,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        skipServiceability: true,
      })
    ).rejects.toThrow(/duplicate|already/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects invalid pickup (not synced)", async () => {
    const { Pickup } = await import("../../models/Pickup.js");
    (Pickup.findById as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      lean: vi.fn(async () => ({ ...pickupLean, lorrigoPickupId: "" })),
    });
    const create = vi.fn(async () => ({ providerOrderId: "o", awb: "X" }));
    registerCourierProvider(makeProvider(create));
    const { bookLorrigoShipment } = await import("./bookShipment.js");
    const order = makeOrder() as unknown as import("../../models/Order.js").IOrder;

    await expect(
      bookLorrigoShipment({
        order,
        provider: "lorrigo",
        pickupAddressId: "507f1f77bcf86cd799439011",
        courierId: "c1",
        weightKg: 0.5,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        skipServiceability: true,
      })
    ).rejects.toThrow(/not synced/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects invalid dimensions", async () => {
    const create = vi.fn(async () => ({ providerOrderId: "o", awb: "X" }));
    registerCourierProvider(makeProvider(create));
    const { bookLorrigoShipment } = await import("./bookShipment.js");
    const order = makeOrder() as unknown as import("../../models/Order.js").IOrder;

    await expect(
      bookLorrigoShipment({
        order,
        provider: "lorrigo",
        pickupAddressId: "507f1f77bcf86cd799439011",
        courierId: "c1",
        weightKg: 0.5,
        lengthCm: -1,
        widthCm: 10,
        heightCm: 10,
        skipServiceability: true,
      })
    ).rejects.toThrow(/length/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("retries transient timeout once", async () => {
    let calls = 0;
    const create = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new AppError(504, "Lorrigo request timed out after 45000ms");
      return {
        providerOrderId: "lo-2",
        awb: "AWB222",
        courierName: "Lorrigo Express",
      };
    });
    registerCourierProvider(makeProvider(create));
    const { bookLorrigoShipment } = await import("./bookShipment.js");
    const order = makeOrder() as unknown as import("../../models/Order.js").IOrder;

    const result = await bookLorrigoShipment({
      order,
      provider: "lorrigo",
      pickupAddressId: "507f1f77bcf86cd799439011",
      courierId: "c1",
      weightKg: 0.5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      skipServiceability: true,
    });

    expect(calls).toBe(2);
    expect(result.awb).toBe("AWB222");
  });

  it("marks reconciliation when Mongo save fails after provider success", async () => {
    const create = vi.fn(async () => ({
      providerOrderId: "lo-3",
      awb: "AWB333",
      courierName: "Lorrigo Express",
    }));
    registerCourierProvider(makeProvider(create));

    const { bookLorrigoShipment } = await import("./bookShipment.js");
    const { Order } = await import("../../models/Order.js");
    const order = makeOrder({
      save: vi.fn(async () => {
        throw new Error("mongo down");
      }),
      _id: "507f1f77bcf86cd799439099",
    }) as unknown as import("../../models/Order.js").IOrder;

    await expect(
      bookLorrigoShipment({
        order,
        provider: "lorrigo",
        pickupAddressId: "507f1f77bcf86cd799439011",
        courierId: "c1",
        weightKg: 0.5,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        skipServiceability: true,
      })
    ).rejects.toThrow(/Reconciliation required/i);

    expect(order.bookingReconciliationRequired).toBe(true);
    expect(order.awb).toBe("AWB333");
    expect(create).toHaveBeenCalledTimes(1);
    expect(Order.updateOne).toHaveBeenCalled();
  });
});
