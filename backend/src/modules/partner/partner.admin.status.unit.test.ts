import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../../test/testEnv.js";

applyDefaultTestEnv();

const partnerFindById = vi.fn();
const partnerSave = vi.fn();

vi.mock("../../models/Partner.js", () => ({
  Partner: {
    findById: (...args: unknown[]) => partnerFindById(...args),
  },
}));

import { adminUpdatePartnerStatus } from "./partner.admin.controller.js";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import type { Response } from "express";

function mockRes(): Response {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
  };
  return res as Response;
}

async function runHandler(
  req: AuthRequest,
  res: Response,
  next: ReturnType<typeof vi.fn> = vi.fn()
): Promise<void> {
  adminUpdatePartnerStatus(req, res, next);
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("adminUpdatePartnerStatus", () => {
  const partnerId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    partnerSave.mockResolvedValue(undefined);
    partnerFindById.mockResolvedValue({
      _id: partnerId,
      name: "Test Partner",
      status: "ACTIVE",
      linkedUserId: new Types.ObjectId(),
      save: partnerSave,
    });
  });

  it("owner can suspend partner", async () => {
    const req = {
      params: { id: String(partnerId) },
      body: { status: "SUSPENDED", reason: "abuse" },
      user: { _id: new Types.ObjectId(), role: "admin" },
    } as unknown as AuthRequest;
    const res = mockRes();
    await runHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(partnerSave).toHaveBeenCalled();
    expect((res.body as { data: { status: string } }).data.status).toBe("SUSPENDED");
  });

  it("owner can disable partner", async () => {
    const req = {
      params: { id: String(partnerId) },
      body: { status: "DISABLED" },
      user: { _id: new Types.ObjectId(), role: "admin" },
    } as unknown as AuthRequest;
    const res = mockRes();
    await runHandler(req, res);
    expect((res.body as { data: { status: string } }).data.status).toBe("DISABLED");
  });

  it("owner can reactivate partner", async () => {
    partnerFindById.mockResolvedValue({
      _id: partnerId,
      name: "Test",
      status: "SUSPENDED",
      linkedUserId: new Types.ObjectId(),
      save: partnerSave,
    });
    const req = {
      params: { id: String(partnerId) },
      body: { status: "ACTIVE" },
      user: { _id: new Types.ObjectId(), role: "admin" },
    } as unknown as AuthRequest;
    const res = mockRes();
    await runHandler(req, res);
    expect((res.body as { data: { status: string } }).data.status).toBe("ACTIVE");
  });

  it("invalid status rejected", async () => {
    const req = {
      params: { id: String(partnerId) },
      body: { status: "BANNED" },
      user: { _id: new Types.ObjectId(), role: "admin" },
    } as unknown as AuthRequest;
    const res = mockRes();
    const next = vi.fn();
    await runHandler(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
