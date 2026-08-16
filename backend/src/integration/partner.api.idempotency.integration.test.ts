import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import mongoose, { Types } from "mongoose";
import { applyDefaultTestEnv } from "../test/testEnv.js";
import { prepareCleanIntegrationTestDb } from "../test/mongoIntegrationSetup.js";
import { createApp } from "../app.js";
import { disconnectDb } from "../config/db.js";
import { User } from "../models/User.js";
import { Partner } from "../models/Partner.js";
import { Pickup } from "../models/Pickup.js";
import { Order } from "../models/Order.js";
import { Transaction } from "../models/Transaction.js";
import { PartnerIdempotencyRecord } from "../models/PartnerIdempotencyRecord.js";
import { Wallet } from "../models/Wallet.js";
import { createPartnerApiKey } from "../modules/partner/partnerApiKeyService.js";

applyDefaultTestEnv();
process.env.PARTNER_API_ENABLED = "true";
process.env.PARTNER_WALLET_BILLING_ENABLED = "true";
process.env.EKART_ENABLED = "true";
process.env.EKART_AUTHORIZATION = "test-integration-auth";
process.env.EKART_MERCHANT_CODE = "TESTMERCHANT";

const bookOrderViaProviderRegistry = vi.hoisted(() => vi.fn());

vi.mock("../modules/courier/bookShipment.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../modules/courier/bookShipment.js")>();
  return {
    ...actual,
    bookOrderViaProviderRegistry: (...args: unknown[]) => bookOrderViaProviderRegistry(...args),
  };
});

const mongoUri = process.env.MONGODB_URI_TEST?.trim();

function hasMongo(): boolean {
  return Boolean(mongoUri);
}

describe.skipIf(!hasMongo())("partner API concurrent idempotency (MONGODB_URI_TEST)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const referenceId = `REF-CONCURRENT-${suffix}`;
  const idempotencyKey = `idem-concurrent-${suffix}`;
  const app = createApp();

  let partnerId: Types.ObjectId;
  let rawKey: string;
  let pickupId: Types.ObjectId;
  let userId: Types.ObjectId;
  let providerBookingWins = 0;

  beforeAll(async () => {
    await prepareCleanIntegrationTestDb(mongoUri!);

    const passwordHash = await bcrypt.hash("testpass12", 10);
    const user = await User.create({
      name: "Idem Partner User",
      email: `partner-idem-${suffix}@example.test`,
      passwordHash,
      role: "dropshipper",
      companyName: "Idem Co",
      emailVerified: true,
    });
    userId = user._id as Types.ObjectId;

    await Wallet.create({ userId, balance: 5000, currency: "INR" });

    const partner = await Partner.create({
      name: `Idem Partner ${suffix}`,
      linkedUserId: userId,
      status: "ACTIVE",
      allowedProviders: ["ekart"],
    });
    partnerId = partner._id as Types.ObjectId;

    const pickup = await Pickup.create({
      userId,
      dropshipperId: userId,
      label: "WH",
      contactName: "Contact",
      phone: "9999999999",
      addressLine1: "Line 1",
      city: "Mumbai",
      state: "MH",
      pincode: "400001",
      country: "India",
      isActive: true,
      isDefault: true,
    });
    pickupId = pickup._id as Types.ObjectId;

    const key = await createPartnerApiKey({ partnerId });
    rawKey = key.rawKey;

    bookOrderViaProviderRegistry.mockImplementation(async (input: {
      order: { orderId: string; awb?: string; shipmentCreated?: boolean };
    }) => {
      const orderId = input.order.orderId;
      const existing = await Order.findOne({ orderId });
      if (existing && (existing.shipmentCreated || String(existing.awb ?? "").trim())) {
        return {
          awb: String(existing.awb),
          status: "BOOKED",
          freightCharge: 25,
        };
      }

      // Simulate claimOrderForBooking: only one concurrent caller wins the provider path.
      const claimed = await Order.findOneAndUpdate(
        {
          orderId,
          shipmentCreated: { $ne: true },
          $or: [{ awb: { $exists: false } }, { awb: null }, { awb: "" }],
          bookingInProgress: { $ne: true },
        },
        {
          $set: {
            bookingInProgress: true,
            bookingInProgressAt: new Date(),
          },
        },
        { new: true }
      );

      if (!claimed) {
        const again = await Order.findOne({ orderId });
        if (again && (again.shipmentCreated || String(again.awb ?? "").trim())) {
          return {
            awb: String(again.awb),
            status: "BOOKED",
            freightCharge: 25,
          };
        }
        const { AppError } = await import("../middleware/errorMiddleware.js");
        throw new AppError(409, "Booking already in progress for this order");
      }

      providerBookingWins += 1;

      await Order.updateOne(
        { orderId },
        {
          $set: {
            awb: `AWB-${suffix}`,
            shipmentCreated: true,
            bookingInProgress: false,
          },
        }
      );

      return {
        awb: `AWB-${suffix}`,
        status: "BOOKED",
        freightCharge: 25,
      };
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await disconnectDb();
    }
  });

  it("concurrent same Idempotency-Key creates one order and one provider booking", async () => {
    const body = {
      referenceId,
      pickupAddressId: String(pickupId),
      provider: "ekart",
      customer: {
        name: "Customer",
        phone: "9999999999",
        email: "c@example.test",
        address: "Addr",
        city: "Mumbai",
        state: "MH",
        pincode: "400001",
      },
      package: { weight: 0.5, length: 10, width: 10, height: 5 },
      paymentMode: "prepaid",
    };

    const headers = {
      Authorization: `Bearer ${rawKey}`,
      "Idempotency-Key": idempotencyKey,
    };

    const [resA, resB] = await Promise.all([
      request(app).post("/api/partner/v1/shipments").set(headers).send(body),
      request(app).post("/api/partner/v1/shipments").set(headers).send(body),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses.some((s) => s === 201)).toBe(true);
    expect(resA.body.success === true || resB.body.success === true).toBe(true);

    for (const res of [resA, resB]) {
      if (res.status === 201) continue;
      // Losing concurrent worker may see retryable in-progress; never non-retryable DUPLICATE_FIELD.
      expect(res.status).toBe(409);
      expect((res.body.error as { code?: string }).code).toBe("IDEMPOTENCY_IN_PROGRESS");
      expect((res.body.error as { retryable?: boolean }).retryable).toBe(true);
    }

    const orders = await Order.find({ partnerId, partnerReferenceId: referenceId });
    expect(orders.length).toBe(1);
    const orderId = orders[0]!.orderId;

    // Successful indexed path: exactly one claim-winning provider booking (reuse/in-progress does not count).
    expect(providerBookingWins).toBe(1);

    const idemRecords = await PartnerIdempotencyRecord.find({
      partnerId,
      idempotencyKey,
    });
    expect(idemRecords.length).toBe(1);

    const shipmentTxns = await Transaction.find({
      referenceType: "shipment",
      referenceId: `shipment:${orderId}`,
    });
    expect(shipmentTxns.length).toBeLessThanOrEqual(1);

    const successBody =
      resA.status === 201 ? resA.body : resB.status === 201 ? resB.body : resA.body;
    expect((successBody.data as { awb?: string })?.awb).toBe(`AWB-${suffix}`);
  });
});
