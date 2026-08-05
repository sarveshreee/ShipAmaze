import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import { probeEkartHealth, resetEkartClientForTests } from "./ekart.client.js";
import {
  clearCourierProviderRegistryForTests,
  resetCourierProviderRegistrationForTests,
} from "../courier/index.js";
import { resetEkartStatusSyncMetricsForTests } from "./ekart.statusSyncMetrics.js";
import { resetEkartMetricsForTests } from "./ekart.metrics.js";

const originalEnv = { ...process.env };

describe("Ekart health diagnostics", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    applyDefaultTestEnv();
    resetEkartClientForTests();
    resetEkartStatusSyncMetricsForTests();
    resetEkartMetricsForTests();
    clearCourierProviderRegistryForTests();
    resetCourierProviderRegistrationForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEkartClientForTests();
    clearCourierProviderRegistryForTests();
    resetCourierProviderRegistrationForTests();
  });

  it("GET /api/ekart/health requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/api/ekart/health");
    expect(res.status).toBe(401);
  });

  it("probe payload never includes credentials when disabled", async () => {
    process.env.EKART_ENABLED = "false";
    process.env.EKART_AUTHORIZATION = "Basic secret-should-not-appear";
    process.env.EKART_MERCHANT_CODE = "TEC";

    const probe = await probeEkartHealth();
    expect(probe.enabled).toBe(false);
    expect(probe.healthy).toBe(false);
    expect(JSON.stringify(probe)).not.toContain("secret-should-not-appear");
    expect(JSON.stringify(probe).toLowerCase()).not.toContain('"token"');
  });

  it("probe reports enabled_unconfigured when flag on without credentials", async () => {
    process.env.EKART_ENABLED = "true";
    delete process.env.EKART_AUTHORIZATION;
    delete process.env.EKART_MERCHANT_CODE;

    const probe = await probeEkartHealth();
    expect(probe.enabled).toBe(true);
    expect(probe.configured).toBe(false);
    expect(probe.healthy).toBe(false);
  });
});
