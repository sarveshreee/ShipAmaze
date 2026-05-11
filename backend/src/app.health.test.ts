import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { applyDefaultTestEnv } from "./test/testEnv.js";
import { createApp } from "./app.js";

beforeAll(() => {
  applyDefaultTestEnv();
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
});
