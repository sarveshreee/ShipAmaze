import { ZodError } from "zod";
import type { Response, NextFunction } from "express";
import { AppError } from "../../middleware/errorMiddleware.js";
import { toClientProviderErrorPayload } from "../courier/http/providerErrors.js";
import {
  ensurePartnerRequestIds,
  type PartnerAuthRequest,
} from "./partnerRequestContext.js";
import { partnerErrorResponse } from "./dto/responses.js";

function envelope(
  req: PartnerAuthRequest,
  code: string,
  message: string,
  retryable: boolean,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const ids = req.partner
    ? { requestId: req.partner.requestId, correlationId: req.partner.correlationId }
    : ensurePartnerRequestIds(req);
  return partnerErrorResponse(code, message, retryable, ids.requestId, ids.correlationId, extra);
}

/**
 * Express error handler for Partner API routes — consistent envelope + request IDs.
 */
export function partnerErrorHandler(
  err: unknown,
  req: PartnerAuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const msg = first?.message || "Validation failed";
    res.status(400).json(envelope(req, "VALIDATION_FAILED", msg, false));
    return;
  }

  if (err instanceof AppError) {
    const anyErr = err as AppError & {
      provider?: string;
      code?: string;
      retryable?: boolean;
      partnerPayload?: Record<string, unknown>;
    };

    if (anyErr.partnerPayload) {
      res.status(err.statusCode).json(anyErr.partnerPayload);
      return;
    }

    if (anyErr.provider) {
      const safe = toClientProviderErrorPayload(anyErr);
      const ids = req.partner
        ? { requestId: req.partner.requestId, correlationId: req.partner.correlationId }
        : ensurePartnerRequestIds(req);
      res.status(err.statusCode).json(
        partnerErrorResponse(
          safe.code ?? "PROVIDER_ERROR",
          safe.message,
          Boolean(safe.retryable),
          safe.requestId ?? ids.requestId,
          safe.correlationId ?? ids.correlationId,
          { provider: safe.provider }
        )
      );
      return;
    }

    const message =
      err.statusCode === 402 ? "Insufficient wallet balance for this shipment" : err.message;
    const code =
      anyErr.code ??
      (err.statusCode === 409
        ? "CONFLICT"
        : err.statusCode === 402
          ? "INSUFFICIENT_BALANCE"
          : err.statusCode === 403
            ? "FORBIDDEN"
            : err.statusCode === 404
              ? "NOT_FOUND"
              : err.statusCode === 401
                ? "UNAUTHORIZED"
                : err.statusCode === 422
                  ? "UNPROCESSABLE_ENTITY"
                  : "REQUEST_FAILED");

    res.status(err.statusCode).json(envelope(req, code, message, Boolean(anyErr.retryable)));
    return;
  }

  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  ) {
    res.status(400).json(
      envelope(req, "DUPLICATE_FIELD", "Duplicate value for a unique field", false)
    );
    return;
  }

  res.status(500).json(envelope(req, "INTERNAL_ERROR", "Internal server error", false));
}
