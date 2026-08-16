import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import type { IPartner } from "../../models/Partner.js";
import type { IPartnerApiKey } from "../../models/PartnerApiKey.js";
import { PARTNER_SCOPES } from "./partnerScopes.js";

applyDefaultTestEnv();

const verifyPartnerApiKeyAuth = vi.fn();
const touchPartnerApiKeyUsage = vi.fn();
const findPartnerOrderByReference = vi.fn();

vi.mock("./partnerApiKeyService.js", () => ({
  verifyPartnerApiKeyAuth: (...args: unknown[]) => verifyPartnerApiKeyAuth(...args),
  touchPartnerApiKeyUsage: (...args: unknown[]) => touchPartnerApiKeyUsage(...args),
}));

vi.mock("./partnerOrderService.js", () => ({
  findPartnerOrderByReference: (...args: unknown[]) => findPartnerOrderByReference(...args),
  assertPartnerOrderAccess: vi.fn(),
  createPartnerOrder: vi.fn(),
}));

vi.mock("./partnerDiscoveryService.js", () => ({
  partnerDiscoverServiceability: vi.fn(),
  partnerDiscoverRates: vi.fn(),
}));

vi.mock("./partnerShipmentCreateService.js", () => ({
  processPartnerShipmentCreate: vi.fn(),
}));

import partnerRouter from "./partner.routes.js";
import { partnerErrorHandler } from "./partnerErrorHandler.js";

const partnerAId = new Types.ObjectId();
const partnerBId = new Types.ObjectId();
const apiKeyId = new Types.ObjectId();
const linkedUserId = new Types.ObjectId();

const partnerA = {
  _id: partnerAId,
  linkedUserId,
  status: "ACTIVE",
  allowedProviders: ["ekart"],
} as IPartner;

const apiKey = {
  _id: apiKeyId,
  partnerId: partnerAId,
  scopes: Object.values(PARTNER_SCOPES),
  status: "ACTIVE",
} as IPartnerApiKey;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/partner/v1", partnerRouter);
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    partnerErrorHandler(err, req, res, next);
  });
  return app;
}

describe("partner API HTTP security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    touchPartnerApiKeyUsage.mockResolvedValue(undefined);
    findPartnerOrderByReference.mockResolvedValue(null);
  });

  it("returns 401 for revoked API key", async () => {
    verifyPartnerApiKeyAuth.mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app)
      .post("/api/partner/v1/serviceability")
      .set("Authorization", "Bearer sk_live_revoked_key_abcdefghijklmnop")
      .send({ fromPincode: "400001", toPincode: "560001" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.correlationId).toBeTruthy();
  });

  it("returns 401 for suspended partner (auth rejects inactive partner)", async () => {
    verifyPartnerApiKeyAuth.mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app)
      .get("/api/partner/v1/shipments/ORDER-10001")
      .set("Authorization", "Bearer sk_live_suspended_key_abcdefghijklmnop");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for disabled partner", async () => {
    verifyPartnerApiKeyAuth.mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app)
      .get("/api/partner/v1/shipments/ORDER-10001")
      .set("Authorization", "Bearer sk_live_disabled_key_abcdefghijklmnop");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 with Partner envelope for scope violation", async () => {
    verifyPartnerApiKeyAuth.mockResolvedValue({
      partner: partnerA,
      apiKey: {
        ...apiKey,
        scopes: [PARTNER_SCOPES.SERVICEABILITY_READ],
      },
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/partner/v1/shipments")
      .set("Authorization", "Bearer sk_live_valid_key_abcdefghijklmnop")
      .set("Idempotency-Key", "idem-scope-test")
      .send({
        referenceId: "REF-SCOPE",
        pickupAddressId: String(new Types.ObjectId()),
        provider: "ekart",
        customer: {
          name: "N",
          phone: "9999999999",
          address: "A",
          city: "Mumbai",
          state: "MH",
          pincode: "400001",
        },
        package: { weight: 0.5, length: 10, width: 10, height: 5 },
        paymentMode: "prepaid",
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.correlationId).toBeTruthy();
  });

  it("returns 404 without leaking cross-partner shipment data", async () => {
    verifyPartnerApiKeyAuth.mockResolvedValue({
      partner: { ...partnerA, _id: partnerBId } as IPartner,
      apiKey: { ...apiKey, partnerId: partnerBId },
    });
    findPartnerOrderByReference.mockImplementation(async (partnerId: Types.ObjectId, ref: string) => {
      if (String(partnerId) === String(partnerAId) && ref === "ORDER-10001") {
        return { orderId: "SP-A", partnerReferenceId: ref, awb: "AWB-SECRET" };
      }
      return null;
    });

    const app = buildApp();
    const res = await request(app)
      .get("/api/partner/v1/shipments/ORDER-10001")
      .set("Authorization", "Bearer sk_live_partner_b_key_abcdefghijklmnop");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("AWB-SECRET");
    expect(findPartnerOrderByReference).toHaveBeenCalledWith(
      expect.anything(),
      "ORDER-10001"
    );
  });
});
