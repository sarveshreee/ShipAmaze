/**
 * Shared courier HTTP error helpers — never include credentials or tokens in client responses.
 * Full provider payloads are logged server-side only (sanitized).
 */

import { AppError } from "../../../middleware/errorMiddleware.js";
import { extractProviderErrorMessage } from "../../../utils/errorMessage.js";
import type { CourierProviderId } from "../types.js";
import { sanitizeForProviderLog } from "./sanitizeForProviderLog.js";

/** Safe fields attached to AppError for middleware / clients. */
export interface ClientSafeProviderError {
  provider: CourierProviderId | string;
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  correlationId?: string;
  providerStatusCode?: number;
}

export interface ProviderErrorFields extends ClientSafeProviderError {
  success: false;
  /** @deprecated Never send raw provider bodies to clients. Kept undefined. */
  providerError?: undefined;
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
    m.includes("timeout") ||
    m.includes("econnreset") ||
    m.includes("econnrefused")
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
    const fields = err as AppError & Partial<ClientSafeProviderError>;
    if (typeof fields.retryable === "boolean") return fields.retryable;
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

export function mapProviderStatusToCode(providerStatus: number, provider: string): string {
  if (providerStatus === 429) return "RATE_LIMITED";
  if (providerStatus === 401 || providerStatus === 403) return "AUTH_FAILED";
  if (providerStatus === 404) return "NOT_FOUND";
  if (providerStatus === 400 || providerStatus === 422) return "VALIDATION_FAILED";
  if (providerStatus === 409) return "CONFLICT";
  if (providerStatus >= 500 || providerStatus === 0) return "PROVIDER_UNAVAILABLE";
  return `${String(provider).toUpperCase()}_ERROR`;
}

/** Public client-safe message — never forward raw provider text that may contain PII. */
export function toClientSafeMessage(
  providerStatus: number,
  rawMsg: string,
  mapMessage?: (rawMsg: string, data: unknown, status: number) => string,
  data?: unknown
): string {
  const mapped = mapMessage ? mapMessage(rawMsg, data, providerStatus) : rawMsg;
  // Strip likely secret-bearing fragments
  const cleaned = String(mapped ?? "")
    .replace(/bearer\s+\S+/gi, "[redacted]")
    .replace(/authorization[=:]\s*\S+/gi, "[redacted]")
    .trim();

  if (providerStatus === 429) return "Provider rate limit exceeded. Please retry shortly.";
  if (providerStatus === 401 || providerStatus === 403) {
    return "Shipping provider authentication failed.";
  }
  if (providerStatus >= 500) {
    // Many providers misuse 5xx for validation / duplicate errors — surface a short useful body.
    const looksGeneric =
      !cleaned ||
      /^(internal server error|error|ok|failed|null|undefined)$/i.test(cleaned) ||
      /^[a-z0-9_-]+ error \d{3}$/i.test(cleaned) ||
      /temporarily unavailable/i.test(cleaned);
    if (!looksGeneric && cleaned.length <= 180) return cleaned;
    return "Shipping provider is temporarily unavailable.";
  }
  if (providerStatus === 504 || /timeout/i.test(cleaned)) {
    return "Shipping provider request timed out.";
  }
  // Keep short validation messages; truncate long opaque dumps
  if (cleaned.length > 180) return "Shipping provider request failed.";
  return cleaned || "Shipping provider request failed.";
}

export function buildProviderAppError(opts: {
  provider: CourierProviderId | string;
  providerStatus: number;
  data: unknown;
  message?: string;
  requestId?: string;
  correlationId?: string;
  code?: string;
  mapMessage?: (rawMsg: string, data: unknown, status: number) => string;
}): AppError & ProviderErrorFields {
  const rawMsg =
    opts.message ||
    extractProviderErrorMessage(opts.data) ||
    `${opts.provider} error ${opts.providerStatus}`;

  const safeMessage = toClientSafeMessage(
    opts.providerStatus,
    rawMsg,
    opts.mapMessage,
    opts.data
  );
  const retryable =
    isRetryableProviderHttpStatus(opts.providerStatus) || opts.providerStatus >= 500;
  const code = opts.code ?? mapProviderStatusToCode(opts.providerStatus, String(opts.provider));

  // Server-side only: sanitized full body for operators (never attached to client response).
  console.error(
    `[${opts.provider}] provider_error code=${code} status=${opts.providerStatus} ` +
      `requestId=${opts.requestId ?? "-"} correlationId=${opts.correlationId ?? "-"} ` +
      `body=${JSON.stringify(sanitizeForProviderLog(opts.data))}`
  );

  const fields: ProviderErrorFields = {
    success: false,
    provider: opts.provider,
    code,
    message: safeMessage,
    retryable,
    requestId: opts.requestId,
    correlationId: opts.correlationId,
    providerStatusCode: opts.providerStatus,
    providerError: undefined,
  };

  const status = mapProviderHttpStatusToAppStatus(opts.providerStatus);
  return Object.assign(new AppError(status, fields.message), fields);
}

/** Shape returned by errorMiddleware for provider failures. */
export function toClientProviderErrorPayload(
  err: AppError & Partial<ClientSafeProviderError>
): ClientSafeProviderError {
  return {
    provider: err.provider ?? "unknown",
    code: err.code ?? "PROVIDER_ERROR",
    message: err.message,
    retryable: err.retryable === true,
    requestId: err.requestId,
    correlationId: err.correlationId,
  };
}
