import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { applyDefaultTestEnv } from "../test/testEnv.js";
import { prepareCleanIntegrationTestDb } from "../test/mongoIntegrationSetup.js";
import { createApp } from "../app.js";
import { disconnectDb } from "../config/db.js";
import { User } from "../models/User.js";
import { EmailVerificationOtp } from "../models/EmailVerificationOtp.js";
import { PasswordResetOtp } from "../models/PasswordResetOtp.js";
import { invalidateToken } from "../modules/velocity/velocity.client.js";

const mongoUri = process.env.MONGODB_URI_TEST?.trim();

function hasMongo(): boolean {
  return Boolean(mongoUri);
}

describe.skipIf(!hasMongo())("API integration (MONGODB_URI_TEST)", () => {
  const app = createApp();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  beforeAll(async () => {
    applyDefaultTestEnv();
    if (!mongoUri) return;
    await prepareCleanIntegrationTestDb(mongoUri);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await disconnectDb();
    }
  });

  async function registerDropshipper(email: string, password: string) {
    const res = await request(app).post("/api/auth/register").send({
      email,
      password,
      name: "Test User",
      role: "dropshipper",
      companyName: "Test Co",
    });
    return res;
  }

  async function forceVerifyEmail(email: string, otpPlain: string) {
    const otpHash = await bcrypt.hash(otpPlain, 10);
    await EmailVerificationOtp.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: { otpHash, expiresAt: new Date(Date.now() + 600_000), attempts: 0 } },
      { upsert: true }
    );
  }

  it("signup → verify email OTP → login → /auth/me", async () => {
    const email = `ds-${suffix}@example.test`;
    const password = "testpass12";

    const reg = await registerDropshipper(email, password);
    expect(reg.status).toBe(201);
    expect(reg.body.needsEmailVerification).toBe(true);

    await forceVerifyEmail(email, "424242");
    const verifyBad = await request(app).post("/api/auth/verify-otp").send({ email, otp: "000000" });
    expect(verifyBad.status).toBeGreaterThanOrEqual(400);

    const verifyOk = await request(app).post("/api/auth/verify-otp").send({ email, otp: "424242" });
    expect(verifyOk.status).toBe(200);
    expect(verifyOk.body.token).toBeTruthy();

    const loginRes = await request(app).post("/api/auth/login").send({ email, password });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token as string;

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email.toLowerCase());
  });

  it("forgot password + reset with OTP (OTP injected in DB)", async () => {
    const email = `fp-${suffix}@example.test`;
    const password = "oldpass12!";
    const reg = await registerDropshipper(email, password);
    expect(reg.status).toBe(201);
    await User.updateOne({ email: email.toLowerCase() }, { $set: { emailVerified: true } });

    await request(app).post("/api/auth/forgot-password").send({ email });
    const code = "919191";
    await PasswordResetOtp.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        $set: {
          otpHash: await bcrypt.hash(code, 10),
          expiresAt: new Date(Date.now() + 600_000),
          attempts: 0,
        },
      },
      { upsert: true }
    );

    const reset = await request(app).post("/api/auth/reset-password").send({
      email,
      otp: code,
      newPassword: "newpass12!",
      confirmPassword: "newpass12!",
    });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({ email, password: "oldpass12!" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/auth/login").send({ email, password: "newpass12!" });
    expect(newLogin.status).toBe(200);
  });

  it("pickup CRUD, default flag, wallet manual recharge, orders list/detail/junk", async () => {
    const email = `flow-${suffix}@example.test`;
    const password = "testpass12!";
    await registerDropshipper(email, password);
    await User.updateOne({ email: email.toLowerCase() }, { $set: { emailVerified: true } });
    const login = await request(app).post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    const token = login.body.token as string;
    const auth = { Authorization: `Bearer ${token}` };

    const p1 = await request(app)
      .post("/api/pickup-addresses")
      .set(auth)
      .send({
        label: "WH A",
        contactName: "Ravi Kumar",
        phone: "9876543210",
        addressLine1: "12 MG Road",
        city: "Bengaluru",
        state: "KA",
        pincode: "560001",
        country: "India",
        isDefault: true,
      });
    expect(p1.status).toBe(201);
    const pid = String(p1.body?.data?.id ?? "");
    expect(pid.length).toBeGreaterThan(10);

    const list = await request(app).get("/api/pickup-addresses").set(auth);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body?.data)).toBe(true);

    const patch = await request(app)
      .put(`/api/pickup-addresses/${pid}`)
      .set(auth)
      .send({
        label: "WH A Updated",
        contactName: "Ravi Kumar",
        phone: "9876543210",
        addressLine1: "12 MG Road",
        city: "Bengaluru",
        state: "KA",
        pincode: "560001",
      });
    expect(patch.status).toBe(200);

    const orderBody = {
      orderId: `T-${suffix}`,
      customer: "Buyer One",
      phone: "9123456789",
      shippingAddress1: "221B Baker Street",
      shippingCity: "Mumbai",
      shippingState: "MH",
      shippingPincode: "400001",
      weight: 1,
      length: 10,
      width: 10,
      height: 10,
      payment: "Prepaid",
      pickupAddressId: pid,
      orderItems: [{ name: "SKU A", qty: 1, price: 100 }],
    };
    const ord = await request(app).post("/api/orders").set(auth).send(orderBody);
    expect(ord.status).toBe(201);
    const orderId = ord.body.id as string;

    const listOrders = await request(app).get("/api/orders").set(auth);
    expect(listOrders.status).toBe(200);
    expect(listOrders.body.orders?.length ?? 0).toBeGreaterThan(0);

    const detail = await request(app).get(`/api/orders/${encodeURIComponent(orderId)}`).set(auth);
    expect(detail.status).toBe(200);

    const walletBefore = await request(app).get("/api/wallet").set(auth);
    expect(walletBefore.status).toBe(200);

    const add = await request(app).post("/api/wallet/add-funds").set(auth).send({ amount: 500, mode: "manual_test" });
    expect(add.status).toBe(201);

    const tx = await request(app).get("/api/wallet/transactions").set(auth);
    expect(tx.status).toBe(200);
    expect(Array.isArray(tx.body?.data)).toBe(true);

    const junk = await request(app)
      .post(`/api/orders/${encodeURIComponent(orderId)}/junk`)
      .set(auth)
      .send({ junkReason: "test junk" });
    expect(junk.status).toBe(200);
  });

  it("admin adjust wallet + tab permissions me", async () => {
    const adminEmail = `adm-${suffix}@example.test`;
    const adminPass = "adminpass12!";
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(adminPass, 10);
    await User.create({
      name: "Admin Test",
      email: adminEmail.toLowerCase(),
      passwordHash,
      role: "admin",
      companyName: "Test",
      permissions: [],
      emailVerified: true,
    });
    const aLogin = await request(app).post("/api/auth/login").send({ email: adminEmail, password: adminPass });
    expect(aLogin.status).toBe(200);
    const adminToken = aLogin.body.token as string;
    const adminAuth = { Authorization: `Bearer ${adminToken}` };

    const dsEmail = `adj-${suffix}@example.test`;
    await registerDropshipper(dsEmail, "testpass12!");
    await User.updateOne({ email: dsEmail.toLowerCase() }, { $set: { emailVerified: true } });
    const ds = await User.findOne({ email: dsEmail.toLowerCase() }).lean();
    expect(ds?._id).toBeTruthy();
    const dsId = String(ds!._id);

    const adjust = await request(app)
      .patch(`/api/admin/wallets/${dsId}/adjust`)
      .set(adminAuth)
      .send({ amount: 250, reason: "integration test credit" });
    expect(adjust.status).toBe(200);

    const tabs = await request(app).get("/api/tab-permissions/me").set(adminAuth);
    expect(tabs.status).toBe(200);
  });

  describe("Velocity (fetch mocked)", () => {
    let origFetch: typeof fetch;

    function defaultVelocityMock(): typeof fetch {
      return (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth-token")) {
          return new Response(JSON.stringify({ token: "mock-velocity-token" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/serviceability")) {
          return new Response(
            JSON.stringify({
              data: [{ courier_name: "MockCourier", serviceable: true }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("/rates")) {
          return new Response(JSON.stringify({ data: { rates: [{ rate: 99 }] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/track")) {
          return new Response(JSON.stringify({ payload: { status: "in_transit" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/cancel")) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("unexpected url in test mock", { status: 599 });
      }) as typeof fetch;
    }

    beforeAll(() => {
      origFetch = globalThis.fetch;
      process.env.VELOCITY_USERNAME ??= "mock-user";
      process.env.VELOCITY_PASSWORD ??= "mock-pass";
      globalThis.fetch = defaultVelocityMock();
    });

    afterEach(() => {
      globalThis.fetch = defaultVelocityMock();
      invalidateToken();
    });

    afterAll(() => {
      globalThis.fetch = origFetch;
      invalidateToken();
    });

    it("POST /api/velocity/serviceability returns success with mocked provider", async () => {
      const email = `vel-${suffix}@example.test`;
      await registerDropshipper(email, "testpass12!");
      await User.updateOne({ email: email.toLowerCase() }, { $set: { emailVerified: true } });
      const login = await request(app).post("/api/auth/login").send({ email, password: "testpass12!" });
      const token = login.body.token as string;

      const res = await request(app)
        .post("/api/velocity/serviceability")
        .set("Authorization", `Bearer ${token}`)
        .send({
          from: "560001",
          to: "400001",
          payment_mode: "prepaid",
          shipment_type: "forward",
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("POST /api/velocity/serviceability maps Velocity 401 to 502", async () => {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth-token")) {
          return new Response(JSON.stringify({ token: "mock-velocity-token" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 });
      }) as typeof fetch;
      invalidateToken();

      const email = `vel401-${suffix}@example.test`;
      await registerDropshipper(email, "testpass12!");
      await User.updateOne({ email: email.toLowerCase() }, { $set: { emailVerified: true } });
      const login = await request(app).post("/api/auth/login").send({ email, password: "testpass12!" });
      const token = login.body.token as string;

      const res = await request(app)
        .post("/api/velocity/serviceability")
        .set("Authorization", `Bearer ${token}`)
        .send({
          from: "560001",
          to: "400001",
          payment_mode: "prepaid",
        });
      expect(res.status).toBe(502);
    });
  });

  it("Shopify status + connect URL shape (mock env credentials)", async () => {
    const email = `sp-${suffix}@example.test`;
    await registerDropshipper(email, "testpass12!");
    await User.updateOne({ email: email.toLowerCase() }, { $set: { emailVerified: true } });
    const login = await request(app).post("/api/auth/login").send({ email, password: "testpass12!" });
    const token = login.body.token as string;

    const st = await request(app).get("/api/shopify/status").set("Authorization", `Bearer ${token}`);
    expect(st.status).toBe(200);
    expect(st.body.connected).toBe(false);

    const conn = await request(app)
      .post("/api/shopify/connect")
      .set("Authorization", `Bearer ${token}`)
      .query({ shop: "test-store.myshopify.com" })
      .send({ shopifyApiKey: "test-client-id", shopifyApiSecret: "test-client-secret" });
    expect(conn.status).toBe(200);
    expect(String(conn.body.url)).toContain("myshopify.com/admin/oauth/authorize");
    expect(String(conn.body.url)).toContain("client_id=test-client-id");
  });

  it("admin user management: create, list, login, unauthorized blocked", async () => {
    const adminEmail = `adm-users-${suffix}@example.test`;
    const adminPass = "adminpass12!";
    const passwordHash = await bcrypt.hash(adminPass, 10);
    await User.create({
      name: "Admin Users Test",
      email: adminEmail.toLowerCase(),
      passwordHash,
      role: "admin",
      companyName: "Test",
      permissions: [],
      emailVerified: true,
    });
    const aLogin = await request(app).post("/api/auth/login").send({ email: adminEmail, password: adminPass });
    expect(aLogin.status).toBe(200);
    const adminToken = aLogin.body.token as string;
    const adminAuth = { Authorization: `Bearer ${adminToken}` };

    const vendorEmail = `vendor-created-${suffix}@example.test`;
    const vendorPass = "vendorpass12!";
    const createVendor = await request(app)
      .post("/api/admin/users/create")
      .set(adminAuth)
      .send({
        name: "Created Vendor",
        email: vendorEmail,
        password: vendorPass,
        role: "vendor",
        companyName: "Vendor Co",
        phone: "9876543210",
        status: "active",
        sendWelcomeEmail: false,
      });
    expect(createVendor.status).toBe(201);
    expect(createVendor.body.user.email).toBe(vendorEmail.toLowerCase());
    expect(createVendor.body.user.role).toBe("vendor");

    const duplicate = await request(app)
      .post("/api/admin/users/create")
      .set(adminAuth)
      .send({
        name: "Dup",
        email: vendorEmail,
        password: vendorPass,
        role: "vendor",
      });
    expect(duplicate.status).toBe(409);

    const dropshipperEmail = `ds-created-${suffix}@example.test`;
    const createDs = await request(app)
      .post("/api/admin/users/create")
      .set(adminAuth)
      .send({
        name: "Created Dropshipper",
        email: dropshipperEmail,
        password: "dropspass12!",
        role: "dropshipper",
        accessType: "RESTRICTED",
        allowWarehouseAccess: false,
        sendWelcomeEmail: false,
      });
    expect(createDs.status).toBe(201);
    expect(createDs.body.user.role).toBe("dropshipper");

    const list = await request(app).get("/api/admin/users?role=vendor").set(adminAuth);
    expect(list.status).toBe(200);
    expect(list.body.items.some((u: { email: string }) => u.email === vendorEmail.toLowerCase())).toBe(true);

    const vendorLogin = await request(app).post("/api/auth/login").send({ email: vendorEmail, password: vendorPass });
    expect(vendorLogin.status).toBe(200);
    expect(vendorLogin.body.user.role).toBe("vendor");

    const dsLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: dropshipperEmail, password: "dropspass12!" });
    expect(dsLogin.status).toBe(200);
    expect(dsLogin.body.user.role).toBe("dropshipper");
    expect(dsLogin.body.user.dropshipperAccessType).toBe("RESTRICTED");
    expect(dsLogin.body.user.allowOwnPickupProcessing).toBe(false);

    const vendorToken = vendorLogin.body.token as string;
    const forbidden = await request(app)
      .post("/api/admin/users/create")
      .set({ Authorization: `Bearer ${vendorToken}` })
      .send({
        name: "Hacker",
        email: `hack-${suffix}@example.test`,
        password: "hackpass12!",
        role: "admin",
      });
    expect(forbidden.status).toBe(403);

    const userId = createVendor.body.user.id as string;
    const reset = await request(app)
      .post(`/api/admin/users/${userId}/reset-password`)
      .set(adminAuth)
      .send({ newPassword: "newvendor12!" });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({ email: vendorEmail, password: vendorPass });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: vendorEmail, password: "newvendor12!" });
    expect(newLogin.status).toBe(200);
  });
});
