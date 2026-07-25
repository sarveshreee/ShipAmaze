import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { safeErrorMessage } from "../utils/logRedact.js";
import { toClientProviderErrorPayload } from "../modules/courier/http/providerErrors.js";

export class AppError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const msg = first?.message || "Validation failed";
    return res.status(400).json({
      success: false,
      message: msg,
      error: msg,
      details: err.flatten().fieldErrors,
    });
  }
  if (err instanceof AppError) {
    const anyErr = err as AppError & {
      provider?: string;
      code?: string;
      retryable?: boolean;
      requestId?: string;
      correlationId?: string;
    };

    // Provider failures: never return raw provider bodies / tokens / stack traces.
    if (anyErr.provider) {
      const safe = toClientProviderErrorPayload(anyErr);
      return res.status(err.statusCode).json({
        success: false,
        message: safe.message,
        error: safe.message,
        provider: safe.provider,
        code: safe.code,
        retryable: safe.retryable,
        requestId: safe.requestId,
        correlationId: safe.correlationId,
      });
    }

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: err.message,
    });
  }
  if (typeof err === "object" && err !== null && "code" in err && (err as { code?: number }).code === 11000) {
    const key = Object.keys((err as { keyPattern?: Record<string, number> }).keyPattern || {})[0] || "field";
    const msg = `Duplicate value for ${key}. Please use a unique value.`;
    return res.status(400).json({ success: false, message: msg, error: msg });
  }
  if (process.env.NODE_ENV === "development") {
    console.error(err);
  } else {
    console.error(safeErrorMessage(err));
  }
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    error: "Internal server error",
  });
}
