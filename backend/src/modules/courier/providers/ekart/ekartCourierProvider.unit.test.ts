import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../ekart/ekart.config.js", () => ({
  isEkartEnabledFlag: vi.fn(() => true),
  isEkartConfigured: vi.fn(() => true),
  ekartConfig: {
    enabled: true,
    baseUrl: "https://api.ekartlogistics.com",
    authorization: "Basic dGVzdDp0ZXN0",
    merchantCode: "TEC",
    serviceCode: "REGULAR",
    goodsCategory: "NON_ESSENTIAL",
    authEndpoint: "/auth/token",
    createEndpoint: "/v2/shipments/create",
    trackEndpoint: "/v2/shipments/track",
    createLargeEndpoint: "/shipments/large/create",
    trackLargeEndpoint: "/shipments/large/track",
    serviceabilityEndpoint: "/v1/offerings",
    tokenCacheTtlMinutes: 40,
    requestTimeoutMs: 30000,
    maxTransientRetries: 2,
    debugLogs: false,
    maxConcurrentRequests: 6,
  },
}));

import {
  clearCourierProviderRegistryForTests,
  registerCourierProvider,
  getCourierProvider,
  resolveCourierProviderId,
  listCourierProviders,
} from "../../providerRegistry.js";
import { resetCourierProviderRegistrationForTests, registerCourierProviders } from "../../registerProviders.js";
import { ekartCourierProvider } from "./ekartCourierProvider.js";
import { EKART_CAPABILITIES, providerSupports } from "../../capabilities.js";
import {
  buildEkartTrackingId,
  buildEkartCreateShipmentPayload,
  parseEkartCreateResponse,
} from "../../../ekart/ekart.payload.js";
import { mapEkartStatusToProviderCanonical } from "../../statusNormalize.js";
import { resetEkartMetricsForTests, getEkartBookingMetrics } from "../../../ekart/ekart.metrics.js";

describe("Ekart provider foundation", () => {
  beforeEach(() => {
    clearCourierProviderRegistryForTests();
    resetCourierProviderRegistrationForTests();
    resetEkartMetricsForTests();
  });

  it("resolves provider id ekart", () => {
    expect(resolveCourierProviderId("ekart")).toBe("ekart");
    expect(resolveCourierProviderId("EKART")).toBe("ekart");
  });

  it("registers when enabled via registerCourierProviders", async () => {
    const { isEkartEnabledFlag } = await import("../../../ekart/ekart.config.js");
    vi.mocked(isEkartEnabledFlag).mockReturnValue(true);
    registerCourierProviders();
    const ids = listCourierProviders().map((p) => p.id);
    expect(ids).toContain("ekart");
  });

  it("does not register when feature flag is false", async () => {
    const { isEkartEnabledFlag } = await import("../../../ekart/ekart.config.js");
    vi.mocked(isEkartEnabledFlag).mockReturnValue(false);
    registerCourierProviders();
    expect(listCourierProviders().map((p) => p.id)).not.toContain("ekart");
  });

  it("declares Phase 1 capabilities without faking unsupported features", () => {
    expect(EKART_CAPABILITIES.booking).toBe(true);
    expect(EKART_CAPABILITIES.tracking).toBe(true);
    expect(EKART_CAPABILITIES.pickupSync).toBe(false);
    expect(EKART_CAPABILITIES.rates).toBe(false);
    expect(EKART_CAPABILITIES.labels).toBe(false);
    expect(EKART_CAPABILITIES.ndr).toBe(false);
    expect(EKART_CAPABILITIES.cancel).toBe(false);
    expect(providerSupports(EKART_CAPABILITIES, "booking")).toBe(true);
    expect(providerSupports(EKART_CAPABILITIES, "pickupSync")).toBe(false);
  });

  it("createPickup is not supported", async () => {
    registerCourierProvider(ekartCourierProvider);
    const p = getCourierProvider("ekart");
    await expect(
      p.createPickup({
        name: "X",
        contactPerson: "Y",
        phone: "9999999999",
        address: "Line 1",
        city: "City",
        state: "State",
        pincode: "560001",
      })
    ).rejects.toMatchObject({ statusCode: 501 });
  });

  it("builds Durin-compliant tracking id format", () => {
    const id = buildEkartTrackingId({
      merchantCode: "TEC",
      paymentMode: "cod",
      orderId: "ORD-1001",
    });
    expect(id).toMatch(/^TEC[CPR]\d{10}$/);
  });

  it("maps Pickup fields into source and return_location", () => {
    const body = buildEkartCreateShipmentPayload({
      orderId: "ORD123",
      paymentMode: "prepaid",
      orderAmount: 500,
      weightKg: 0.5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      pickup: {
        label: "WH1",
        contactName: "Alice",
        phone: "9876543210",
        addressLine1: "12 MG Road",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560001",
      },
      customer: {
        name: "Bob",
        phone: "9123456789",
        address: "45 Park Street",
        city: "Kolkata",
        state: "West Bengal",
        pincode: "700016",
      },
      items: [{ name: "Shirt", qty: 1, price: 500 }],
      trackingId: "TECP0000000001",
    });

    const detail = (body.services as any)[0].service_details[0];
    expect(detail.service_data.source.address.first_name).toBe("Alice");
    expect(detail.service_data.source.address.pincode).toBe("560001");
    expect(detail.service_data.return_location.address.pincode).toBe("560001");
    expect(detail.service_data.destination.address.pincode).toBe("700016");
    expect(detail.shipment.tracking_id).toBe("TECP0000000001");
  });

  it("uses location_code when ekartLocationCode is set", () => {
    const body = buildEkartCreateShipmentPayload({
      orderId: "ORD124",
      paymentMode: "cod",
      orderAmount: 100,
      codAmount: 100,
      weightKg: 1,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      pickup: {
        ekartLocationCode: "TEC_BLR_01",
        addressLine1: "ignored when code set",
        city: "Bengaluru",
        state: "KA",
        pincode: "560001",
        phone: "9876543210",
      },
      customer: {
        name: "Bob",
        phone: "9123456789",
        address: "Addr",
        city: "City",
        state: "State",
        pincode: "110001",
      },
      items: [],
      trackingId: "TECC0000000002",
    });
    const detail = (body.services as any)[0].service_details[0];
    expect(detail.service_data.source).toEqual({ location_code: "TEC_BLR_01" });
  });

  it("parses create success and rejection", () => {
    const ok = parseEkartCreateResponse({
      request_id: "req-1",
      response: [{ tracking_id: "TECP1", status: "REQUEST_RECEIVED", status_code: 200 }],
    });
    expect(ok.rejected).toBe(false);
    expect(ok.trackingId).toBe("TECP1");

    const bad = parseEkartCreateResponse({
      response: [{ tracking_id: "TECP1", status: "REQUEST_REJECTED", message: ["bad"] }],
    });
    expect(bad.rejected).toBe(true);
  });

  it("normalizes Ekart tracking statuses", () => {
    expect(mapEkartStatusToProviderCanonical("delivered")).toBe("DELIVERED");
    expect(mapEkartStatusToProviderCanonical("out_for_delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapEkartStatusToProviderCanonical("pickup_complete")).toBe("PICKED_UP");
    expect(mapEkartStatusToProviderCanonical("rto_completed")).toBe("RETURNED");
  });

  it("booking metrics start empty", () => {
    expect(getEkartBookingMetrics().attempts).toBe(0);
  });
});
