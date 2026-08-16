import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Response } from "express";
import type { PartnerAuthRequest } from "./partnerRequestContext.js";
import { ensurePartnerRequestIds } from "./partnerRequestContext.js";
import { partnerErrorResponse } from "./dto/responses.js";
import {
  partnerAuthFailureRateLimitMax,
  partnerAuthFailureRateLimitWindowMs,
  partnerBookingRateLimitMax,
  partnerBookingRateLimitWindowMs,
  partnerGeneralRateLimitMax,
  partnerGeneralRateLimitWindowMs,
  partnerRateLimitPassOnStoreError,
} from "./partnerConfig.js";
import { createPartnerRateLimitStore } from "./partnerRateLimitStoreFactory.js";

function partnerRateLimitHandler(
  req: PartnerAuthRequest,
  res: Response,
  code: string,
  message: string
): void {
  const ids = req.partner
    ? { requestId: req.partner.requestId, correlationId: req.partner.correlationId }
    : ensurePartnerRequestIds(req);
  const retryAfterRaw = res.getHeader("Retry-After");
  const retryAfter =
    retryAfterRaw != null && String(retryAfterRaw).trim() !== ""
      ? Number(retryAfterRaw)
      : undefined;
  res.status(429).json(
    partnerErrorResponse(
      code,
      message,
      true,
      ids.requestId,
      ids.correlationId,
      retryAfter != null && Number.isFinite(retryAfter) ? { retryAfter } : undefined
    )
  );
}

function limiterOpts(
  windowMs: number,
  max: number,
  keySuffix: string,
  code: string,
  message: string,
  storePrefix: string
): Partial<Options> {
  return {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createPartnerRateLimitStore(),
    passOnStoreError: partnerRateLimitPassOnStoreError(),
    keyGenerator: (req) => `${storePrefix}${partnerKey(req as PartnerAuthRequest, keySuffix)}`,
    handler: (req, res) => {
      partnerRateLimitHandler(req as PartnerAuthRequest, res, code, message);
    },
  };
}

function partnerKey(req: PartnerAuthRequest, suffix: string): string {
  const partnerId = req.partner?.partnerId;
  if (partnerId) return `partner:${partnerId}:${suffix}`;
  return `partner:ip:${ipKeyGenerator(req.ip ?? "unknown")}:${suffix}`;
}

export const partnerAuthFailureLimiter = rateLimit({
  windowMs: partnerAuthFailureRateLimitWindowMs(),
  max: partnerAuthFailureRateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  store: createPartnerRateLimitStore(),
  passOnStoreError: partnerRateLimitPassOnStoreError(),
  keyGenerator: (req) =>
    `partner-auth-fail:${ipKeyGenerator(req.ip ?? "unknown")}`,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    partnerRateLimitHandler(
      req as PartnerAuthRequest,
      res,
      "RATE_LIMITED",
      "Too many authentication failures. Please try again later."
    );
  },
});

export const partnerGeneralLimiter = rateLimit(
  limiterOpts(
    partnerGeneralRateLimitWindowMs(),
    partnerGeneralRateLimitMax(),
    "general",
    "RATE_LIMITED",
    "Too many requests. Please try again later.",
    "partner-general:"
  )
);

export const partnerBookingLimiter = rateLimit(
  limiterOpts(
    partnerBookingRateLimitWindowMs(),
    partnerBookingRateLimitMax(),
    "booking",
    "BOOKING_RATE_LIMITED",
    "Too many booking requests. Please wait and try again.",
    "partner-booking:"
  )
);
