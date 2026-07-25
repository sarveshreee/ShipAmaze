/**
 * Velocity error helpers — thin re-exports of shared courier error utilities
 * so existing Velocity imports keep working without duplication.
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import {
  isRetryableProviderHttpStatus,
  isTransientNetworkMessage as sharedIsTransientNetworkMessage,
  providerPublicMessage,
} from "../courier/http/providerErrors.js";

export function isRetryableVelocityHttpStatus(status: number): boolean {
  return isRetryableProviderHttpStatus(status);
}

export function isTransientNetworkMessage(msg: string): boolean {
  return sharedIsTransientNetworkMessage(msg);
}

/** User-safe message for logs and optional client `code` field. */
export function velocityPublicMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return providerPublicMessage(err, "Shipping provider request failed");
}
