import { describe, it, expect, beforeEach } from "vitest";
import {
  clearCourierProviderRegistryForTests,
  registerCourierProvider,
  getCourierProvider,
  getCourierProviderForId,
  resolveCourierProviderId,
  listCourierProviders,
  DEFAULT_COURIER_PROVIDER_ID,
} from "./providerRegistry.js";
import type { CourierProvider } from "./CourierProvider.js";

function stubProvider(id: "velocity" | "lorrigo", configured = true): CourierProvider {
  return {
    id,
    displayName: id,
    capabilities: {
      authentication: true,
      serviceability: true,
      rates: true,
      booking: id === "velocity",
      tracking: id === "velocity",
      cancel: id === "velocity",
      ndr: false,
      returns: false,
      pickupSync: true,
      labels: id === "velocity",
      webhooks: false,
    },
    isConfigured: () => configured,
    authenticate: async () => undefined,
    serviceability: async () => [],
    getRates: async () => [],
    createPickup: async () => ({ pickupId: "x" }),
    createShipment: async () => ({
      providerOrderId: "o",
      awb: "a",
    }),
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

describe("courier provider registry", () => {
  beforeEach(() => {
    clearCourierProviderRegistryForTests();
  });

  it("defaults unknown / empty provider ids to velocity", () => {
    expect(resolveCourierProviderId(undefined)).toBe(DEFAULT_COURIER_PROVIDER_ID);
    expect(resolveCourierProviderId("")).toBe("velocity");
    expect(resolveCourierProviderId("VELO CITY")).toBe("velocity");
    expect(resolveCourierProviderId("lorrigo")).toBe("lorrigo");
  });

  it("registers and resolves providers without if/else in callers", () => {
    registerCourierProvider(stubProvider("velocity"));
    registerCourierProvider(stubProvider("lorrigo"));

    expect(getCourierProvider("velocity").id).toBe("velocity");
    expect(getCourierProviderForId("lorrigo").id).toBe("lorrigo");
    expect(listCourierProviders()).toHaveLength(2);
  });

  it("throws when provider is not registered", () => {
    expect(() => getCourierProvider("velocity")).toThrow(/not registered/i);
  });
});
