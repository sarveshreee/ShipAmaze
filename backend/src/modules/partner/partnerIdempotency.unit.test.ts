import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import { AppError } from "../../middleware/errorMiddleware.js";

applyDefaultTestEnv();

const findOneAndUpdate = vi.fn();
const findOne = vi.fn();
const create = vi.fn();

vi.mock("../../models/PartnerIdempotencyRecord.js", () => ({
  PartnerIdempotencyRecord: {
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
    findOne: (...args: unknown[]) => findOne(...args),
    create: (...args: unknown[]) => create(...args),
  },
}));

import {
  ensurePartnerIdempotencyPending,
  fingerprintPartnerRequest,
  stableCanonicalJson,
} from "./partnerIdempotency.js";

describe("partnerIdempotency fingerprint", () => {
  it("fingerprints identical bodies consistently", () => {
    const body = { referenceId: "A", provider: "ekart" };
    expect(fingerprintPartnerRequest(body)).toEqual(fingerprintPartnerRequest(body));
  });

  it("same logical object with different key order => same fingerprint", () => {
    const a = fingerprintPartnerRequest({ referenceId: "ABC", provider: "lorrigo" });
    const b = fingerprintPartnerRequest({ provider: "lorrigo", referenceId: "ABC" });
    expect(a).toEqual(b);
  });

  it("nested objects with different key order => same fingerprint", () => {
    const a = fingerprintPartnerRequest({
      referenceId: "R1",
      customer: { name: "N", phone: "9999999999", city: "Mumbai", state: "MH", pincode: "400001", address: "A" },
    });
    const b = fingerprintPartnerRequest({
      customer: { pincode: "400001", address: "A", state: "MH", city: "Mumbai", phone: "9999999999", name: "N" },
      referenceId: "R1",
    });
    expect(a).toEqual(b);
  });

  it("arrays preserve order", () => {
    const a = fingerprintPartnerRequest({ items: [{ name: "A" }, { name: "B" }] });
    const b = fingerprintPartnerRequest({ items: [{ name: "B" }, { name: "A" }] });
    expect(a).not.toEqual(b);
  });

  it("genuinely different values => different fingerprint", () => {
    const a = fingerprintPartnerRequest({ referenceId: "A" });
    const b = fingerprintPartnerRequest({ referenceId: "B" });
    expect(a).not.toEqual(b);
  });

  it("stableCanonicalJson sorts keys", () => {
    expect(stableCanonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe("ensurePartnerIdempotencyPending", () => {
  const partnerId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
  });

  it("reuses existing record with matching fingerprint via update", async () => {
    findOneAndUpdate.mockResolvedValue({ _id: new Types.ObjectId() });

    await ensurePartnerIdempotencyPending({
      partnerId,
      idempotencyKey: "key-1",
      requestFingerprint: "fp-match",
      partnerReferenceId: "REF-1",
      orderId: "SP-1",
    });

    expect(findOneAndUpdate).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    const update = findOneAndUpdate.mock.calls[0]?.[1] as {
      $set?: { status?: string; orderId?: string };
    };
    expect(update.$set?.status).toBe("PENDING");
    expect(update.$set?.orderId).toBe("SP-1");
  });

  it("creates record when none exists", async () => {
    findOneAndUpdate.mockResolvedValue(null);
    findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    });
    create.mockResolvedValue({ _id: new Types.ObjectId() });

    await ensurePartnerIdempotencyPending({
      partnerId,
      idempotencyKey: "key-new",
      requestFingerprint: "fp-new",
      partnerReferenceId: "REF-NEW",
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]?.status).toBe("PENDING");
  });

  it("throws conflict when fingerprint differs", async () => {
    findOneAndUpdate.mockResolvedValue(null);
    findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ requestFingerprint: "other-fp" }),
    });

    await expect(
      ensurePartnerIdempotencyPending({
        partnerId,
        idempotencyKey: "key-conflict",
        requestFingerprint: "fp-mine",
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Idempotency-Key was already used with a different request body",
    });

    expect(create).not.toHaveBeenCalled();
  });

  it("retries update on duplicate-key race during create", async () => {
    findOneAndUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: new Types.ObjectId() });
    findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    });
    const dupErr = Object.assign(new Error("dup"), { code: 11000 });
    create.mockRejectedValue(dupErr);

    await ensurePartnerIdempotencyPending({
      partnerId,
      idempotencyKey: "key-race",
      requestFingerprint: "fp-race",
    });

    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledOnce();
  });

  it("throws in-progress when duplicate-key race has mismatched fingerprint", async () => {
    findOneAndUpdate.mockResolvedValue(null);
    findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    });
    const dupErr = Object.assign(new Error("dup"), { code: 11000 });
    create.mockRejectedValue(dupErr);

    await expect(
      ensurePartnerIdempotencyPending({
        partnerId,
        idempotencyKey: "key-race-fail",
        requestFingerprint: "fp-race-fail",
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Idempotency key conflict — request already in progress",
    });
  });
});
