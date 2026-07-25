import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCourierProviderRegistryForTests,
  registerCourierProvider,
} from "./providerRegistry.js";
import { clearServiceabilityCacheForTests } from "./serviceabilityCache.js";
import { resetDiscoveryMetricsForTests, getDiscoveryMetricsSnapshot } from "./discoveryMetrics.js";
import { discoverServiceability } from "./discoverCouriers.js";
import type { CourierProvider } from "./CourierProvider.js";
import type { ProviderCourierOption } from "./types.js";
import { AppError } from "../../middleware/errorMiddleware.js";

function option(
  provider: "velocity" | "lorrigo",
  id: string,
  name: string
): ProviderCourierOption {
  return {
    provider,
    courierId: id,
    courierName: name,
    serviceable: true,
    freight: 10,
    codSupported: true,
    pickupAvailable: true,
  };
}

function stub(
  id: "velocity" | "lorrigo",
  impl: {
    serviceability?: () => Promise<ProviderCourierOption[]>;
    configured?: boolean;
  }
): CourierProvider {
  return {
    id,
    displayName: id,
    capabilities: {
      authentication: true,
      serviceability: true,
      rates: true,
      booking: false,
      tracking: false,
      cancel: false,
      ndr: false,
      returns: false,
      pickupSync: true,
      labels: false,
      webhooks: false,
    },
    isConfigured: () => impl.configured !== false,
    authenticate: async () => undefined,
    serviceability: impl.serviceability ?? (async () => []),
    getRates: async () => [],
    createPickup: async () => ({ pickupId: "x" }),
    createShipment: async () => ({ providerOrderId: "o", awb: "a" }),
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

describe("discoverServiceability", () => {
  const prevMode = process.env.COURIER_DISCOVERY_MODE;
  const prevTtl = process.env.COURIER_SERVICEABILITY_CACHE_TTL_SECONDS;
  const prevLorrigo = process.env.LORRIGO_ENABLED;

  beforeEach(() => {
    clearCourierProviderRegistryForTests();
    clearServiceabilityCacheForTests();
    resetDiscoveryMetricsForTests();
    process.env.COURIER_DISCOVERY_MODE = "both";
    process.env.COURIER_SERVICEABILITY_CACHE_TTL_SECONDS = "60";
    process.env.LORRIGO_ENABLED = "true";
  });

  afterEach(() => {
    if (prevMode === undefined) delete process.env.COURIER_DISCOVERY_MODE;
    else process.env.COURIER_DISCOVERY_MODE = prevMode;
    if (prevTtl === undefined) delete process.env.COURIER_SERVICEABILITY_CACHE_TTL_SECONDS;
    else process.env.COURIER_SERVICEABILITY_CACHE_TTL_SECONDS = prevTtl;
    if (prevLorrigo === undefined) delete process.env.LORRIGO_ENABLED;
    else process.env.LORRIGO_ENABLED = prevLorrigo;
  });

  it("returns normalized couriers from both providers (success)", async () => {
    registerCourierProvider(
      stub("velocity", {
        serviceability: async () => [option("velocity", "v1", "Velocity Express")],
      })
    );
    registerCourierProvider(
      stub("lorrigo", {
        serviceability: async () => [option("lorrigo", "l1", "Lorrigo Surface")],
      })
    );

    const result = await discoverServiceability({
      fromPincode: "110001",
      toPincode: "400001",
      paymentMode: "prepaid",
      weightKg: 0.5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    });

    expect(result.couriers).toHaveLength(2);
    expect(result.couriers.every((c) => c.serviceable && c.provider && c.courierId)).toBe(true);
    expect(result.providers.every((p) => p.ok)).toBe(true);
    expect(result.metrics.courierCount).toBe(2);
  });

  it("cache miss then cache hit for the same lane", async () => {
    let calls = 0;
    registerCourierProvider(
      stub("velocity", {
        serviceability: async () => {
          calls += 1;
          return [option("velocity", "v1", "V")];
        },
      })
    );

    process.env.COURIER_DISCOVERY_MODE = "velocity";
    const input = {
      fromPincode: "110001",
      toPincode: "400001",
      paymentMode: "prepaid" as const,
      weightKg: 1,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    };

    const first = await discoverServiceability(input);
    const second = await discoverServiceability(input);

    expect(calls).toBe(1);
    expect(first.providers[0]?.cacheHit).toBe(false);
    expect(second.providers[0]?.cacheHit).toBe(true);
    expect(getDiscoveryMetricsSnapshot().cacheHits).toBeGreaterThanOrEqual(1);
    expect(getDiscoveryMetricsSnapshot().cacheMisses).toBeGreaterThanOrEqual(1);
  });

  it("isolates provider failure so the other still returns", async () => {
    registerCourierProvider(
      stub("velocity", {
        serviceability: async () => [option("velocity", "v1", "V")],
      })
    );
    registerCourierProvider(
      stub("lorrigo", {
        serviceability: async () => {
          throw new AppError(502, "Lorrigo down");
        },
      })
    );

    const result = await discoverServiceability({
      fromPincode: "110001",
      toPincode: "400001",
      paymentMode: "cod",
      collectableAmount: 100,
    });

    expect(result.couriers).toHaveLength(1);
    expect(result.couriers[0]?.provider).toBe("velocity");
    expect(result.metrics.providerFailures).toBe(1);
  });

  it("records provider timeout", async () => {
    registerCourierProvider(
      stub("velocity", {
        serviceability: async () => {
          throw new AppError(504, "Velocity request timed out after 45000ms");
        },
      })
    );
    process.env.COURIER_DISCOVERY_MODE = "velocity";

    const result = await discoverServiceability({
      fromPincode: "110001",
      toPincode: "400001",
      paymentMode: "prepaid",
    });

    expect(result.couriers).toHaveLength(0);
    expect(result.providers[0]?.timedOut).toBe(true);
    expect(result.metrics.providerTimeouts).toBe(1);
  });

  it("rejects invalid pincode", async () => {
    registerCourierProvider(stub("velocity", {}));
    process.env.COURIER_DISCOVERY_MODE = "velocity";
    await expect(
      discoverServiceability({
        fromPincode: "12",
        toPincode: "400001",
        paymentMode: "prepaid",
      })
    ).rejects.toThrow(/pincode/i);
  });

  it("rejects invalid dimensions on rates path via discoverRates weight check in discover", async () => {
    registerCourierProvider(stub("velocity", {}));
    process.env.COURIER_DISCOVERY_MODE = "velocity";
    const { discoverRates } = await import("./discoverCouriers.js");
    await expect(
      discoverRates({
        fromPincode: "110001",
        toPincode: "400001",
        paymentMode: "prepaid",
        weightKg: -1,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      })
    ).rejects.toThrow(/weight/i);
  });

  it("skips Lorrigo when feature flag disabled even if mode=both", async () => {
    process.env.LORRIGO_ENABLED = "false";
    process.env.COURIER_DISCOVERY_MODE = "both";
    const lorrigoSvc = vi.fn(async () => [option("lorrigo", "l1", "L")]);
    registerCourierProvider(
      stub("velocity", {
        serviceability: async () => [option("velocity", "v1", "V")],
      })
    );
    registerCourierProvider(stub("lorrigo", { serviceability: lorrigoSvc }));

    const result = await discoverServiceability({
      fromPincode: "110001",
      toPincode: "400001",
      paymentMode: "prepaid",
    });

    expect(lorrigoSvc).not.toHaveBeenCalled();
    expect(result.couriers.every((c) => c.provider === "velocity")).toBe(true);
  });

  it("never caches failures", async () => {
    let calls = 0;
    registerCourierProvider(
      stub("velocity", {
        serviceability: async () => {
          calls += 1;
          throw new AppError(502, "fail");
        },
      })
    );
    process.env.COURIER_DISCOVERY_MODE = "velocity";
    const input = {
      fromPincode: "110001",
      toPincode: "400001",
      paymentMode: "prepaid" as const,
    };
    await discoverServiceability(input);
    await discoverServiceability(input);
    expect(calls).toBe(2);
  });
});
