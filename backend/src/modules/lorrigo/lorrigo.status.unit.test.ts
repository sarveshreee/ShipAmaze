import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import { probeLorrigoAuth, resetLorrigoClientForTests } from "./lorrigo.client.js";
import {
  clearCourierProviderRegistryForTests,
  resetCourierProviderRegistrationForTests,
} from "../courier/index.js";

const originalEnv = { ...process.env };

describe("Lorrigo status diagnostics", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    applyDefaultTestEnv();
    resetLorrigoClientForTests();
    clearCourierProviderRegistryForTests();
    resetCourierProviderRegistrationForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetLorrigoClientForTests();
    clearCourierProviderRegistryForTests();
    resetCourierProviderRegistrationForTests();
  });

  it("GET /api/lorrigo/status requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/api/lorrigo/status");
    expect(res.status).toBe(401);
  });

  it("GET /api/lorrigo/health requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/api/lorrigo/health");
    expect(res.status).toBe(401);
  });

  it("probe status payload never includes token fields when disabled", async () => {
    process.env.LORRIGO_ENABLED = "false";
    process.env.LORRIGO_EMAIL = "a@b.com";
    process.env.LORRIGO_PASSWORD = "secret-should-not-appear";

    const probe = await probeLorrigoAuth();
    expect(probe.status).toBe("disabled");
    expect(JSON.stringify(probe)).not.toContain("secret-should-not-appear");
    expect(JSON.stringify(probe).toLowerCase()).not.toContain("token");
  });
});
