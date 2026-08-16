import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { partnerAuthMiddleware } from "./partnerAuthMiddleware.js";
import { attachPartnerContext } from "./partnerRequestContext.js";
import { PARTNER_SCOPES } from "./partnerScopes.js";
import { requirePartnerScope } from "./partnerAuthMiddleware.js";

describe("partnerAuthMiddleware", () => {
  it("returns 401 without Authorization header", async () => {
    const app = express();
    app.get("/test", partnerAuthMiddleware, (_req, res) => res.json({ ok: true }));
    app.use((err: { statusCode?: number; message?: string }, _req, res, _next) => {
      res.status(err.statusCode ?? 500).json({ success: false, message: err.message });
    });

    const res = await request(app).get("/test").expect(401);
    expect(res.body.message).toBeTruthy();
  });

  it("enforces scopes when context is attached manually", async () => {
    const app = express();
    app.get("/scoped", (req, res, next) => {
      attachPartnerContext(req, {
        partnerId: "p1",
        apiKeyId: "k1",
        scopes: [PARTNER_SCOPES.SERVICEABILITY_READ],
        linkedUserId: "u1",
      });
      next();
    }, requirePartnerScope(PARTNER_SCOPES.SHIPMENTS_CREATE), (_req, res) => {
      res.json({ ok: true });
    });

    await request(app).get("/scoped").expect(403);
  });
});
