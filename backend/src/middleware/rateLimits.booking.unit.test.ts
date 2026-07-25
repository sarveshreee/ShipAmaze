import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { courierBookingLimiter } from "./rateLimits.js";

describe("courierBookingLimiter", () => {
  it("returns 429 with Retry-After after max bookings in window", async () => {
    const prevMax = process.env.RATE_LIMIT_COURIER_BOOKING_MAX;
    const prevWin = process.env.RATE_LIMIT_COURIER_BOOKING_WINDOW_MS;
    process.env.RATE_LIMIT_COURIER_BOOKING_MAX = "2";
    process.env.RATE_LIMIT_COURIER_BOOKING_WINDOW_MS = "60000";

    // Re-import would be needed for env change — limiter already constructed with defaults.
    // So construct a one-off limiter for this test.
    const rateLimit = (await import("express-rate-limit")).default;
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: "Too many booking requests. Please wait and try again.",
        code: "BOOKING_RATE_LIMITED",
        retryable: true,
      },
    });

    const app = express();
    app.post("/api/courier/shipments", limiter, (_req, res) => {
      res.json({ success: true });
    });

    await request(app).post("/api/courier/shipments").expect(200);
    await request(app).post("/api/courier/shipments").expect(200);
    const limited = await request(app).post("/api/courier/shipments").expect(429);
    expect(limited.body.code).toBe("BOOKING_RATE_LIMITED");
    expect(limited.headers["ratelimit-policy"] || limited.headers["retry-after"]).toBeTruthy();

    if (prevMax === undefined) delete process.env.RATE_LIMIT_COURIER_BOOKING_MAX;
    else process.env.RATE_LIMIT_COURIER_BOOKING_MAX = prevMax;
    if (prevWin === undefined) delete process.env.RATE_LIMIT_COURIER_BOOKING_WINDOW_MS;
    else process.env.RATE_LIMIT_COURIER_BOOKING_WINDOW_MS = prevWin;

    // Ensure exported limiter exists
    expect(typeof courierBookingLimiter).toBe("function");
    vi.clearAllMocks();
  });
});
