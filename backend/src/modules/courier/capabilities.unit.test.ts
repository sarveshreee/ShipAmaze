import { describe, expect, it } from "vitest";
import {
  EKART_CAPABILITIES,
  LORRIGO_CAPABILITIES,
  VELOCITY_CAPABILITIES,
  getStaticProviderCapabilities,
  providerSupports,
} from "./capabilities.js";

describe("provider capabilities registry", () => {
  it("declares Velocity booking/tracking/labels", () => {
    expect(VELOCITY_CAPABILITIES.booking).toBe(true);
    expect(VELOCITY_CAPABILITIES.tracking).toBe(true);
    expect(VELOCITY_CAPABILITIES.labels).toBe(true);
  });

  it("declares Lorrigo booking", () => {
    expect(LORRIGO_CAPABILITIES.booking).toBe(true);
    expect(LORRIGO_CAPABILITIES.webhooks).toBe(false);
  });

  it("declares Ekart Phase 1 caps without pickup sync", () => {
    expect(EKART_CAPABILITIES.booking).toBe(true);
    expect(EKART_CAPABILITIES.tracking).toBe(true);
    expect(EKART_CAPABILITIES.pickupSync).toBe(false);
    expect(EKART_CAPABILITIES.rates).toBe(false);
    expect(EKART_CAPABILITIES.ndr).toBe(false);
  });

  it("providerSupports reads capability flags", () => {
    expect(providerSupports(getStaticProviderCapabilities("velocity"), "booking")).toBe(true);
    expect(providerSupports(getStaticProviderCapabilities("ekart"), "pickupSync")).toBe(false);
  });
});
