import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import { attachPartnerContext } from "./partnerRequestContext.js";
import { PARTNER_SCOPES } from "./partnerScopes.js";
import {
  resetPartnerRateLimitStoresForTests,
  SharedMemoryPartnerRateLimitStore,
} from "./mongoPartnerRateLimitStore.js";
import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";

applyDefaultTestEnv();

process.env.PARTNER_RATE_LIMIT_STORE = "shared-memory";
process.env.PARTNER_GENERAL_RATE_LIMIT_MAX = "5";
process.env.PARTNER_BOOKING_RATE_LIMIT_MAX = "3";
process.env.PARTNER_AUTH_FAILURE_RATE_LIMIT_MAX = "4";

function partnerGeneralHandler(
  req: express.Request,
  res: express.Response,
  code: string,
  message: string
): void {
  res.status(429).json({
    success: false,
    error: { code, message, retryable: true },
    requestId: "req-test",
    correlationId: "corr-test",
    retryAfter: res.getHeader("Retry-After"),
  });
}

function buildGeneralLimiter(max: number) {
  const store = new SharedMemoryPartnerRateLimitStore();
  return rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    keyGenerator: (req) => {
      const partnerId = (req as { partner?: { partnerId?: string } }).partner?.partnerId;
      const base = partnerId
        ? `partner:${partnerId}:general`
        : `partner:ip:unknown:general`;
      return `partner-general:${base}`;
    },
    handler: (req, res) => partnerGeneralHandler(req, res, "RATE_LIMITED", "Too many requests"),
  });
}

function buildBookingLimiter(max: number) {
  const store = new SharedMemoryPartnerRateLimitStore();
  return rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    keyGenerator: (req) => {
      const partnerId = (req as { partner?: { partnerId?: string } }).partner?.partnerId;
      const base = partnerId
        ? `partner:${partnerId}:booking`
        : `partner:ip:unknown:booking`;
      return `partner-booking:${base}`;
    },
    handler: (req, res) =>
      partnerGeneralHandler(req, res, "BOOKING_RATE_LIMITED", "Too many booking requests"),
  });
}

function buildAuthFailureLimiter(max: number) {
  const store = new SharedMemoryPartnerRateLimitStore();
  return rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    keyGenerator: (req) => `partner-auth-fail:${ipKeyGenerator(req.ip ?? "unknown")}`,
    skipSuccessfulRequests: true,
    handler: (req, res) =>
      partnerGeneralHandler(req, res, "RATE_LIMITED", "Too many authentication failures"),
  });
}

function mountPartnerApp(limiter: express.RequestHandler, partnerId: string) {
  const app = express();
  app.use((req, _res, next) => {
    attachPartnerContext(req, {
      partnerId,
      apiKeyId: "key-1",
      scopes: [...Object.values(PARTNER_SCOPES)],
      linkedUserId: "user-1",
    });
    next();
  });
  app.use(limiter);
  app.get("/hit", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("partner distributed rate limits (shared-memory)", () => {
  beforeEach(() => {
    resetPartnerRateLimitStoresForTests();
  });

  it("shares general counter across simulated instances", async () => {
    const limiter = buildGeneralLimiter(5);
    const appA = mountPartnerApp(limiter, "partner-a");
    const appB = mountPartnerApp(limiter, "partner-a");

    for (let i = 0; i < 3; i++) {
      await request(appA).get("/hit").expect(200);
    }
    for (let i = 0; i < 2; i++) {
      await request(appB).get("/hit").expect(200);
    }
    const limited = await request(appB).get("/hit").expect(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(limited.body.success).toBe(false);
  });

  it("shares booking counter across simulated instances", async () => {
    const limiter = buildBookingLimiter(3);
    const appA = mountPartnerApp(limiter, "partner-book");
    const appB = mountPartnerApp(limiter, "partner-book");

    await request(appA).get("/hit").expect(200);
    await request(appB).get("/hit").expect(200);
    await request(appA).get("/hit").expect(200);
    const limited = await request(appB).get("/hit").expect(429);
    expect(limited.body.error.code).toBe("BOOKING_RATE_LIMITED");
  });

  it("isolates different partners on general limiter", async () => {
    const limiter = buildGeneralLimiter(2);
    const appA = mountPartnerApp(limiter, "partner-1");
    const appB = mountPartnerApp(limiter, "partner-2");

    await request(appA).get("/hit").expect(200);
    await request(appA).get("/hit").expect(200);
    await request(appA).get("/hit").expect(429);

    await request(appB).get("/hit").expect(200);
  });

  it("returns Partner 429 envelope with Retry-After", async () => {
    const limiter = buildGeneralLimiter(1);
    const app = mountPartnerApp(limiter, "partner-retry");

    await request(app).get("/hit").expect(200);
    const res = await request(app).get("/hit").expect(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.correlationId).toBeTruthy();
    expect(res.headers["retry-after"] || res.headers["ratelimit-reset"]).toBeTruthy();
  });

  it("shares auth-failure counter by IP across instances", async () => {
    const limiter = buildAuthFailureLimiter(4);
    const appA = express();
    appA.use(limiter);
    appA.get("/auth", (_req, res) => res.status(401).json({ ok: false }));

    const appB = express();
    appB.use(limiter);
    appB.get("/auth", (_req, res) => res.status(401).json({ ok: false }));

    for (let i = 0; i < 2; i++) {
      await request(appA).get("/auth").expect(401);
    }
    for (let i = 0; i < 2; i++) {
      await request(appB).get("/auth").expect(401);
    }
    const limited = await request(appB).get("/auth").expect(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });

  it("isolates auth-failure limits by IP", async () => {
    const limiter = buildAuthFailureLimiter(2);
    const app = express();
    app.set("trust proxy", 1);
    app.use(limiter);
    app.get("/auth", (_req, res) => res.status(401).json({ ok: false }));

    await request(app).get("/auth").set("X-Forwarded-For", "10.0.0.1").expect(401);
    await request(app).get("/auth").set("X-Forwarded-For", "10.0.0.1").expect(401);
    await request(app).get("/auth").set("X-Forwarded-For", "10.0.0.1").expect(429);

    await request(app).get("/auth").set("X-Forwarded-For", "10.0.0.2").expect(401);
  });
});

describe("MongoPartnerRateLimitStore store failure", () => {
  const findOneAndUpdate = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    findOneAndUpdate.mockRejectedValue(new Error("mongo down"));
  });

  it("passOnStoreError allows traffic when increment throws", async () => {
    vi.doMock("../../models/PartnerRateLimitCounter.js", () => ({
      PartnerRateLimitCounter: {
        findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
        createIndexes: vi.fn().mockResolvedValue(undefined),
      },
    }));

    const { MongoPartnerRateLimitStore } = await import("./mongoPartnerRateLimitStore.js");
    const store = new MongoPartnerRateLimitStore();
    store.init({ windowMs: 60_000 });

    const limiter = rateLimit({
      windowMs: 60_000,
      max: 1,
      store,
      passOnStoreError: true,
      keyGenerator: () => "k1",
      handler: (_req, res) => res.status(429).json({ limited: true }),
    });

    const app = express();
    app.use(limiter);
    app.get("/", (_req, res) => res.json({ ok: true }));

    await request(app).get("/").expect(200);
    await request(app).get("/").expect(200);
  });
});
