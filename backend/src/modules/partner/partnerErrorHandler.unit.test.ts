import { describe, expect, it, vi, beforeEach } from "vitest";
import { Types } from "mongoose";
import { ZodError } from "zod";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { partnerErrorHandler } from "./partnerErrorHandler.js";
import type { PartnerAuthRequest } from "./partnerRequestContext.js";

applyDefaultTestEnv();

function mockRes() {
  const res = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    jsonBody: null as unknown,
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
    headersSent: false,
  };
  return res;
}

describe("partnerErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats Zod validation errors with requestId", () => {
    const req = {
      headers: { "x-request-id": "req-zod-1" },
    } as PartnerAuthRequest;
    const res = mockRes();
    const next = vi.fn();
    const err = new ZodError([{ code: "custom", message: "name required", path: ["name"] }]);

    partnerErrorHandler(err, req, res, next);

    expect(res.statusCode).toBe(400);
    const body = res.jsonBody as { error: { code: string }; requestId: string };
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.requestId).toBe("req-zod-1");
  });

  it("formats AppError 402 as INSUFFICIENT_BALANCE", () => {
    const req = {
      partner: {
        partnerId: String(new Types.ObjectId()),
        apiKeyId: "k",
        scopes: [],
        linkedUserId: "u",
        requestId: "req-402",
        correlationId: "corr-402",
      },
    } as PartnerAuthRequest;
    const res = mockRes();
    partnerErrorHandler(new AppError(402, "Insufficient wallet balance"), req, res, vi.fn());
    const body = res.jsonBody as { error: { code: string; message: string } };
    expect(res.statusCode).toBe(402);
    expect(body.error.code).toBe("INSUFFICIENT_BALANCE");
    expect(body.error.message).toContain("Insufficient wallet");
  });

  it("formats AppError 422 as UNPROCESSABLE_ENTITY", () => {
    const req = {
      partner: {
        partnerId: String(new Types.ObjectId()),
        apiKeyId: "k",
        scopes: [],
        linkedUserId: "u",
        requestId: "req-422",
        correlationId: "corr-422",
      },
    } as PartnerAuthRequest;
    const res = mockRes();
    partnerErrorHandler(new AppError(422, "Pickup is not synced to Lorrigo"), req, res, vi.fn());
    const body = res.jsonBody as { error: { code: string } };
    expect(res.statusCode).toBe(422);
    expect(body.error.code).toBe("UNPROCESSABLE_ENTITY");
  });
});
