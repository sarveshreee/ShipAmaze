import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { applyDefaultTestEnv } from "./test/testEnv.js";
import { createApp } from "./app.js";

const originalEnv = { ...process.env };

beforeAll(() => {
  applyDefaultTestEnv();
});

beforeEach(() => {
  process.env = { ...originalEnv };
  applyDefaultTestEnv();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("createApp (no database)", () => {
  it("GET /health returns ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: "shipamaze-api" });
  });

  it("GET /api/missing returns 404 JSON", async () => {
    const app = createApp();
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("allows production CORS preflight for FRONTEND_URL origin", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "";
    process.env.FRONTEND_URL = "https://shipamaze.com/";

    const app = createApp();
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://shipamaze.com")
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://shipamaze.com");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-max-age"]).toBe("86400");
  });

  it("keeps production CORS blocked for unconfigured origins", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "https://shipamaze.com";
    process.env.FRONTEND_URL = "";

    const app = createApp();
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
