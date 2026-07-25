import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildProviderAppError,
  toClientProviderErrorPayload,
} from "./http/providerErrors.js";
import { AppError, errorMiddleware } from "../../middleware/errorMiddleware.js";
import {
  resetSyncMutexForTests,
  withSyncMutex,
  isSyncMutexSkipResult,
  getSyncMutexSkippedCount,
} from "./syncMutex.js";
import type { Request, Response } from "express";

describe("sanitized provider errors", () => {
  it("does not attach raw provider payloads on AppError", () => {
    const err = buildProviderAppError({
      provider: "lorrigo",
      providerStatus: 500,
      data: {
        token: "secret-token",
        Authorization: "Bearer xyz",
        stack: "Error: boom\n at foo",
        internalId: "abc-123",
      },
      requestId: "req-1",
      correlationId: "corr-1",
    });

    expect(err.providerError).toBeUndefined();
    expect(err.message).not.toMatch(/secret-token|Bearer|stack/i);
    expect(err.code).toBe("PROVIDER_UNAVAILABLE");
    expect(err.retryable).toBe(true);

    const client = toClientProviderErrorPayload(err);
    expect(client).toEqual({
      provider: "lorrigo",
      code: "PROVIDER_UNAVAILABLE",
      message: err.message,
      retryable: true,
      requestId: "req-1",
      correlationId: "corr-1",
    });
  });

  it("errorMiddleware never returns providerError field", () => {
    const err = buildProviderAppError({
      provider: "velocity",
      providerStatus: 422,
      data: { message: "Invalid pincode", rawDump: { nested: true } },
    });

    const json = vi.fn();
    const res = {
      status: vi.fn(() => ({ json })),
    } as unknown as Response;

    errorMiddleware(err, {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body.providerError).toBeUndefined();
    expect(body.provider).toBe("velocity");
    expect(body.code).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/rawDump/);
  });
});

describe("sync mutex", () => {
  beforeEach(() => {
    resetSyncMutexForTests();
  });

  it("skips overlapping runs and records skipped count", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const first = withSyncMutex("test:job", async () => {
      await gate;
      return { ok: true };
    });

    // Allow first to acquire
    await new Promise((r) => setTimeout(r, 5));
    const second = await withSyncMutex("test:job", async () => ({ ok: false }));
    expect(isSyncMutexSkipResult(second)).toBe(true);
    expect(getSyncMutexSkippedCount("test:job")).toBe(1);

    release();
    const result = await first;
    expect(result).toEqual({ ok: true });
  });
});

describe("provider failure AppError shape", () => {
  it("marks rate limits retryable", () => {
    const err = buildProviderAppError({
      provider: "lorrigo",
      providerStatus: 429,
      data: { message: "slow down" },
    });
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.code).toBe("RATE_LIMITED");
  });
});
