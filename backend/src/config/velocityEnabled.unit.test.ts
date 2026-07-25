import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearCourierProviderRegistryForTests,
  listCourierProviders,
  registerCourierProviders,
  resetCourierProviderRegistrationForTests,
} from "../modules/courier/index.js";
import { resolveDiscoveryProviderIds } from "../modules/courier/discoveryConfig.js";
import { isVelocityActive, isVelocityEnabledFlag } from "./env.js";

describe("VELOCITY_ENABLED kill switch", () => {
  const prev = {
    VELOCITY_ENABLED: process.env.VELOCITY_ENABLED,
    LORRIGO_ENABLED: process.env.LORRIGO_ENABLED,
    VELOCITY_USERNAME: process.env.VELOCITY_USERNAME,
    VELOCITY_PASSWORD: process.env.VELOCITY_PASSWORD,
  };

  beforeEach(() => {
    clearCourierProviderRegistryForTests();
    resetCourierProviderRegistrationForTests();
    delete process.env.VELOCITY_USERNAME;
    delete process.env.VELOCITY_PASSWORD;
    process.env.LORRIGO_ENABLED = "false";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("defaults to enabled when unset (backward compatible)", () => {
    delete process.env.VELOCITY_ENABLED;
    expect(isVelocityEnabledFlag()).toBe(true);
  });

  it("disables when VELOCITY_ENABLED=false", () => {
    process.env.VELOCITY_ENABLED = "false";
    expect(isVelocityEnabledFlag()).toBe(false);
    process.env.VELOCITY_USERNAME = "u";
    process.env.VELOCITY_PASSWORD = "p";
    expect(isVelocityActive()).toBe(false);
  });

  it("does not register Velocity when disabled", () => {
    process.env.VELOCITY_ENABLED = "false";
    process.env.VELOCITY_USERNAME = "u";
    process.env.VELOCITY_PASSWORD = "p";
    registerCourierProviders();
    expect(listCourierProviders().map((p) => p.id)).not.toContain("velocity");
  });

  it("registers Velocity when enabled", () => {
    process.env.VELOCITY_ENABLED = "true";
    process.env.VELOCITY_USERNAME = "u";
    process.env.VELOCITY_PASSWORD = "p";
    registerCourierProviders();
    expect(listCourierProviders().map((p) => p.id)).toContain("velocity");
  });

  it("excludes Velocity from discovery when disabled", () => {
    process.env.VELOCITY_ENABLED = "false";
    process.env.LORRIGO_ENABLED = "true";
    expect(resolveDiscoveryProviderIds("both")).toEqual(["lorrigo"]);
    expect(resolveDiscoveryProviderIds("velocity")).toEqual([]);
  });

  it("keeps Lorrigo discovery when Velocity is disabled", () => {
    process.env.VELOCITY_ENABLED = "false";
    process.env.LORRIGO_ENABLED = "true";
    expect(resolveDiscoveryProviderIds("lorrigo")).toEqual(["lorrigo"]);
  });
});
