import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import mongoose, { Types } from "mongoose";
import { applyDefaultTestEnv } from "../test/testEnv.js";
import { prepareCleanIntegrationTestDb } from "../test/mongoIntegrationSetup.js";
import { createApp } from "../app.js";
import { disconnectDb } from "../config/db.js";
import { User } from "../models/User.js";
import { Partner } from "../models/Partner.js";
import { Order } from "../models/Order.js";
import {
  createPartnerApiKey,
  revokePartnerApiKey,
} from "../modules/partner/partnerApiKeyService.js";
import { PARTNER_SCOPES } from "../modules/partner/partnerScopes.js";

const mongoUri = process.env.MONGODB_URI_TEST?.trim();

function hasMongo(): boolean {
  return Boolean(mongoUri);
}

describe.skipIf(!hasMongo())("partner API security integration (MONGODB_URI_TEST)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const app = createApp();

  let userAId: Types.ObjectId;
  let userBId: Types.ObjectId;
  let partnerAId: Types.ObjectId;
  let partnerBId: Types.ObjectId;
  let rawKeyA: string;
  let rawKeyB: string;
  let rawKeyLimitedScope: string;

  beforeAll(async () => {
    applyDefaultTestEnv();
    process.env.PARTNER_API_ENABLED = "true";
    await prepareCleanIntegrationTestDb(mongoUri!);

    const passwordHash = await bcrypt.hash("testpass12", 10);
    const userA = await User.create({
      name: "Partner Sec A",
      email: `partner-sec-a-${suffix}@example.test`,
      passwordHash,
      role: "dropshipper",
      companyName: "Sec A",
      emailVerified: true,
    });
    const userB = await User.create({
      name: "Partner Sec B",
      email: `partner-sec-b-${suffix}@example.test`,
      passwordHash,
      role: "dropshipper",
      companyName: "Sec B",
      emailVerified: true,
    });
    userAId = userA._id as Types.ObjectId;
    userBId = userB._id as Types.ObjectId;

    const partnerA = await Partner.create({
      name: `Sec Partner A ${suffix}`,
      linkedUserId: userAId,
      status: "ACTIVE",
      allowedProviders: ["ekart"],
    });
    const partnerB = await Partner.create({
      name: `Sec Partner B ${suffix}`,
      linkedUserId: userBId,
      status: "ACTIVE",
      allowedProviders: ["ekart"],
    });
    partnerAId = partnerA._id as Types.ObjectId;
    partnerBId = partnerB._id as Types.ObjectId;

    const keyA = await createPartnerApiKey({ partnerId: partnerAId });
    const keyB = await createPartnerApiKey({ partnerId: partnerBId });
    const keyLimited = await createPartnerApiKey({
      partnerId: partnerAId,
      scopes: [PARTNER_SCOPES.SERVICEABILITY_READ],
    });
    rawKeyA = keyA.rawKey;
    rawKeyB = keyB.rawKey;
    rawKeyLimitedScope = keyLimited.rawKey;

    await Order.create({
      orderId: `SP-SEC-A-${suffix}`,
      customer: "Buyer",
      phone: "9999999999",
      createdBy: userAId,
      dropshipperId: userAId,
      partnerId: partnerAId,
      partnerReferenceId: `REF-A-${suffix}`,
      awb: "AWB-SECRET-VALUE",
      shipmentCreated: true,
      status: "ready_to_ship",
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await disconnectDb();
    }
  });

  it("cross-partner GET shipment returns 404 NOT_FOUND without data leakage", async () => {
    const res = await request(app)
      .get(`/api/partner/v1/shipments/REF-A-${suffix}`)
      .set("Authorization", `Bearer ${rawKeyB}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("AWB-SECRET-VALUE");
  });

  it("revoked API key returns 401 with Partner envelope", async () => {
    const revoked = await createPartnerApiKey({ partnerId: partnerAId });
    await revokePartnerApiKey(revoked.document._id);

    const res = await request(app)
      .get(`/api/partner/v1/shipments/REF-A-${suffix}`)
      .set("Authorization", `Bearer ${revoked.rawKey}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.correlationId).toBeTruthy();
  });

  it("suspended partner returns 401", async () => {
    await Partner.findByIdAndUpdate(partnerAId, { $set: { status: "SUSPENDED" } });

    const res = await request(app)
      .get(`/api/partner/v1/shipments/REF-A-${suffix}`)
      .set("Authorization", `Bearer ${rawKeyA}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");

    await Partner.findByIdAndUpdate(partnerAId, { $set: { status: "ACTIVE" } });
  });

  it("disabled partner returns 401", async () => {
    await Partner.findByIdAndUpdate(partnerAId, { $set: { status: "DISABLED" } });

    const res = await request(app)
      .get(`/api/partner/v1/shipments/REF-A-${suffix}`)
      .set("Authorization", `Bearer ${rawKeyA}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");

    await Partner.findByIdAndUpdate(partnerAId, { $set: { status: "ACTIVE" } });
  });

  it("scope violation returns 403 FORBIDDEN", async () => {
    const res = await request(app)
      .post("/api/partner/v1/shipments")
      .set("Authorization", `Bearer ${rawKeyLimitedScope}`)
      .set("Idempotency-Key", `idem-scope-${suffix}`)
      .send({
        referenceId: `REF-SCOPE-${suffix}`,
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
});
