import { describe, expect, it, vi, beforeEach } from "vitest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../../test/testEnv.js";

applyDefaultTestEnv();

const partnerCreate = vi.fn();
const userFindById = vi.fn();

vi.mock("../../models/Partner.js", () => ({
  Partner: { create: (...args: unknown[]) => partnerCreate(...args) },
}));

vi.mock("../../models/PartnerApiKey.js", () => ({
  PartnerApiKey: {},
}));

vi.mock("../../models/User.js", () => ({
  User: { findById: (...args: unknown[]) => userFindById(...args) },
}));

vi.mock("./partnerApiKeyService.js", () => ({
  createPartnerApiKey: vi.fn(),
  revokePartnerApiKey: vi.fn(),
}));

import { adminCreatePartner } from "./partner.admin.controller.js";
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

async function runAdminCreate(
  req: AuthRequest,
  res: Response,
  next: ReturnType<typeof vi.fn> = vi.fn()
): Promise<void> {
  adminCreatePartner(req, res, next);
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("adminCreatePartner wallet validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PARTNER_WALLET_BILLING_ENABLED = "false";
    partnerCreate.mockResolvedValue({
      _id: new Types.ObjectId(),
      name: "Test",
      status: "ACTIVE",
      linkedUserId: new Types.ObjectId(),
    });
  });

  it("billing disabled allows vendor linked user", async () => {
    userFindById.mockResolvedValue({ _id: new Types.ObjectId(), role: "vendor" });
    const req = {
      body: { name: "P1", linkedUserId: String(new Types.ObjectId()) },
      user: { _id: new Types.ObjectId() },
    } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();
    await runAdminCreate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
  });

  it("billing enabled rejects non-dropshipper", async () => {
    process.env.PARTNER_WALLET_BILLING_ENABLED = "true";
    userFindById.mockResolvedValue({ _id: new Types.ObjectId(), role: "vendor" });
    const req = {
      body: { name: "P1", linkedUserId: String(new Types.ObjectId()) },
      user: { _id: new Types.ObjectId() },
    } as AuthRequest;
    const next = vi.fn();
    await runAdminCreate(req, mockRes(), next);
    expect(partnerCreate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0]?.[0] as { statusCode?: number };
    expect(err?.statusCode).toBe(400);
  });

  it("billing enabled allows dropshipper", async () => {
    process.env.PARTNER_WALLET_BILLING_ENABLED = "true";
    const uid = new Types.ObjectId();
    userFindById.mockResolvedValue({ _id: uid, role: "dropshipper" });
    const req = {
      body: { name: "P1", linkedUserId: String(uid) },
      user: { _id: new Types.ObjectId() },
    } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();
    await runAdminCreate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
  });
});
