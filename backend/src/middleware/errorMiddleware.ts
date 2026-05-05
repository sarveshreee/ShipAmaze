import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      error: "Validation failed",
      details: err.flatten().fieldErrors,
    });
  }
  if (err instanceof AppError) {
    const anyErr = err as unknown as { providerError?: unknown };
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: err.message,
      providerError: anyErr.providerError,
    });
  }
  if (typeof err === "object" && err !== null && "code" in err && (err as { code?: number }).code === 11000) {
    const key = Object.keys((err as { keyPattern?: Record<string, number> }).keyPattern || {})[0] || "field";
    const msg = `Duplicate value for ${key}. Please use a unique value.`;
    return res.status(400).json({ success: false, message: msg, error: msg });
  }
  console.error(err);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    error: "Internal server error",
    providerError: undefined,
  });
}
