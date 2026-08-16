import request from "supertest";
import { describe, expect, it } from "vitest";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import { createApp } from "../../app.js";

applyDefaultTestEnv();

describe("partner API health", () => {
  it("GET /api/partner/v1/health is public", async () => {
    const app = createApp();
    const res = await request(app).get("/api/partner/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe("shipamaze-partner-api");
  });
});
