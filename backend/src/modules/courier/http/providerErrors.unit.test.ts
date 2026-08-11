import { describe, it, expect } from "vitest";
import { AppError } from "../../../middleware/errorMiddleware.js";
import {
  buildProviderAppError,
  isRetryableProviderError,
  isRetryableProviderHttpStatus,
  mapProviderHttpStatusToAppStatus,
} from "./providerErrors.js";

describe("providerErrors", () => {
  it("maps provider HTTP statuses consistently", () => {
    expect(mapProviderHttpStatusToAppStatus(400)).toBe(400);
    expect(mapProviderHttpStatusToAppStatus(401)).toBe(502);
    expect(mapProviderHttpStatusToAppStatus(422)).toBe(422);
    expect(mapProviderHttpStatusToAppStatus(429)).toBe(429);
    expect(mapProviderHttpStatusToAppStatus(500)).toBe(502);
  });

  it("identifies retryable statuses and AppErrors", () => {
    expect(isRetryableProviderHttpStatus(429)).toBe(true);
    expect(isRetryableProviderHttpStatus(400)).toBe(false);
    expect(isRetryableProviderError(new AppError(504, "timeout"))).toBe(true);
    expect(isRetryableProviderError(new AppError(400, "bad"))).toBe(false);
  });

  it("builds provider AppError with sanitized public message and no raw body", () => {
    const err = buildProviderAppError({
      provider: "velocity",
      providerStatus: 422,
      data: { message: "Invalid pincode", token: "secret" },
      requestId: "req-1",
    });
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe("Invalid pincode");
    expect(err.provider).toBe("velocity");
    expect(err.requestId).toBe("req-1");
    expect(err.providerError).toBeUndefined();
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  it("surfaces useful 5xx provider messages instead of always saying unavailable", () => {
    expect(
      buildProviderAppError({
        provider: "lorrigo",
        providerStatus: 500,
        data: { message: "facilityName already exists" },
      }).message
    ).toBe("facilityName already exists");
    expect(
      buildProviderAppError({
        provider: "lorrigo",
        providerStatus: 503,
        data: null,
      }).message
    ).toBe("Shipping provider is temporarily unavailable.");
  });
});

