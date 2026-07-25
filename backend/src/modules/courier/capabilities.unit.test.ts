import { describe, expect, it } from "vitest";
import {
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

  it("declares Lorrigo booking after Phase 5", () => {
    expect(LORRIGO_CAPABILITIES.booking).toBe(true);
    expect(LORRIGO_CAPABILITIES.ndr).toBe(false);
    expect(LORRIGO_CAPABILITIES.webhooks).toBe(false);
  });

  it("providerSupports reads capability flags", () => {
    expect(providerSupports(getStaticProviderCapabilities("velocity"), "booking")).toBe(true);
    expect(providerSupports(getStaticProviderCapabilities("lorrigo"), "ndr")).toBe(false);
  });
});
