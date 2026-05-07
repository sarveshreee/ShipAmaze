/**
 * Centralized Velocity / shipping error helpers for consistent API responses.
 * Never include credentials or raw provider tokens in messages.
 */

import { AppError } from "../../middleware/errorMiddleware.js";

export function isRetryableVelocityHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function isTransientNetworkMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("network error") || m.includes("abort") || m.includes("fetch failed") || m.includes("timeout");
}

/** User-safe message for logs and optional client `code` field. */
export function velocityPublicMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return "Shipping provider request failed";
}
