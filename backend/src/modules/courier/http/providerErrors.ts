/**
 * Shared courier HTTP error helpers — never include credentials or tokens in messages.
 */

import { AppError } from "../../../middleware/errorMiddleware.js";
import { extractProviderErrorMessage } from "../../../utils/errorMessage.js";
import type { CourierProviderId } from "../types.js";

export interface ProviderErrorFields {
  success: false;
  message: string;
  provider: CourierProviderId | string;
  providerStatusCode: number;
  providerError: unknown;
  requestId?: string;
}

export function isRetryableProviderHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function isTransientNetworkMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("network error") ||
    m.includes("abort") ||
    m.includes("fetch failed") ||
    m.includes("timeout")
  );
}

export function mapProviderHttpStatusToAppStatus(providerStatus: number): number {
  if (providerStatus === 400) return 400;
  if (providerStatus === 401) return 502;
  if (providerStatus === 422) return 422;
  if (providerStatus === 429) return 429;
  if (providerStatus >= 500) return 502;
  return 502;
}

export function isRetryableProviderError(err: unknown): boolean {
  if (err instanceof AppError) {
    if (isRetryableProviderHttpStatus(err.statusCode)) return true;
    if (err.statusCode === 504) return true;
    return isTransientNetworkMessage(err.message);
  }
  return false;
}

export function providerPublicMessage(err: unknown, fallback = "Shipping provider request failed"): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function buildProviderAppError(opts: {
  provider: CourierProviderId | string;
  providerStatus: number;
  data: unknown;
  message?: string;
  requestId?: string;
  mapMessage?: (rawMsg: string, data: unknown, status: number) => string;
}): AppError & ProviderErrorFields {
  const rawMsg =
    opts.message ||
    extractProviderErrorMessage(opts.data) ||
    `${opts.provider} error ${opts.providerStatus}`;
  const friendly = opts.mapMessage
    ? opts.mapMessage(rawMsg, opts.data, opts.providerStatus)
    : rawMsg;

  const providerError: ProviderErrorFields = {
    success: false,
    message: friendly,
    provider: opts.provider,
    providerStatusCode: opts.providerStatus,
    providerError: opts.data,
    requestId: opts.requestId,
  };

  const status = mapProviderHttpStatusToAppStatus(opts.providerStatus);
  return Object.assign(new AppError(status, providerError.message), providerError);
}
