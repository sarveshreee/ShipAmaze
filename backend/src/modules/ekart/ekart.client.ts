/**
 * Ekart HTTP client — Basic → Bearer token mint via /auth/token, then shared provider HTTP stack.
 * Never logs Authorization, merchant code, or credentials.
 */

import { randomUUID } from "crypto";
import { AppError } from "../../middleware/errorMiddleware.js";
import {
  createProviderHttpClient,
  logProviderAuthFailure,
  type ProviderHttpClient,
} from "../courier/http/providerHttpClient.js";
import { ekartConfig, isEkartConfigured, isEkartEnabledFlag } from "./ekart.config.js";

export interface EkartAuthMetrics {
  lastAuthAt: string | null;
  lastRefreshAt: string | null;
  lastAuthLatencyMs: number | null;
  lastRequestRetryCount: number;
  totalRequestRetries: number;
  cacheExpiresAt: string | null;
  uptimeSeconds: number;
  apiVersion: string;
}

const PROCESS_STARTED_AT = Date.now();
export const EKART_API_VERSION = "v2";
/** Human-readable Durin product line for health / debugging. */
export const EKART_API_PRODUCT = "Durin V2";
/** OpenAPI `info.version` from Durin Non_Large docs. */
export const EKART_OPENAPI_VERSION = "2.0.0";

let client: ProviderHttpClient | null = null;
let loginAttemptCount = 0;
let lastAuthAt: Date | null = null;
let lastRefreshAt: Date | null = null;
let lastAuthLatencyMs: number | null = null;
let lastRequestRetryCount = 0;
let totalRequestRetries = 0;

function assertEkartAllowed(): void {
  if (!isEkartEnabledFlag()) {
    throw new AppError(503, "Ekart integration is disabled (EKART_ENABLED is not true).");
  }
  if (!isEkartConfigured()) {
    throw new AppError(503, "Ekart integration is not configured (missing credentials).");
  }
}

/**
 * Mint Bearer token using Basic Auth + HTTP_X_MERCHANT_CODE (Durin GettingStarted).
 */
async function fetchNewToken(): Promise<string> {
  assertEkartAllowed();

  loginAttemptCount += 1;
  const attempt = loginAttemptCount;
  const correlationId = randomUUID();
  const path = ekartConfig.authEndpoint.startsWith("/")
    ? ekartConfig.authEndpoint
    : `/${ekartConfig.authEndpoint}`;
  const url = `${ekartConfig.baseUrl}${path}`;
  const started = Date.now();

  console.info(`[ekart] auth attempt #${attempt} requestId=${correlationId}`);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ekartConfig.requestTimeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ekartConfig.authorization,
        HTTP_X_MERCHANT_CODE: ekartConfig.merchantCode,
        "X-Request-Id": correlationId,
      },
      signal: ctrl.signal,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const elapsedMs = Date.now() - started;
    lastAuthLatencyMs = elapsedMs;
    if (name === "AbortError") {
      console.error(
        `[ekart] auth failure #${attempt} timeout after ${elapsedMs}ms requestId=${correlationId}`
      );
      throw new AppError(504, `Ekart request timed out after ${ekartConfig.requestTimeoutMs}ms`);
    }
    console.error(
      `[ekart] auth failure #${attempt} network error after ${elapsedMs}ms requestId=${correlationId}`
    );
    throw new AppError(502, `Ekart network error: ${String(err)}`);
  } finally {
    clearTimeout(t);
  }

  const elapsedMs = Date.now() - started;
  lastAuthLatencyMs = elapsedMs;

  if (!res.ok) {
    const text = await res.text();
    logProviderAuthFailure("ekart", res.status, text, ekartConfig.debugLogs);
    console.error(
      `[ekart] auth failure #${attempt} status=${res.status} durationMs=${elapsedMs} requestId=${correlationId}`
    );
    throw new AppError(
      502,
      `Ekart auth failed (${res.status}). Check credentials and provider status.`
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    console.error(
      `[ekart] auth failure #${attempt} invalid JSON durationMs=${elapsedMs} requestId=${correlationId}`
    );
    throw new AppError(502, "Ekart auth: invalid JSON response");
  }

  // Durin returns { Authorization: "Bearer <jwt>" }
  const authHeader =
    typeof body.Authorization === "string"
      ? body.Authorization.trim()
      : typeof body.authorization === "string"
        ? body.authorization.trim()
        : "";
  let token = "";
  if (/^bearer\s+/i.test(authHeader)) {
    token = authHeader.replace(/^bearer\s+/i, "").trim();
  } else if (typeof body.access_token === "string") {
    token = body.access_token.trim();
  } else if (authHeader) {
    token = authHeader;
  }

  if (!token) {
    console.error(
      `[ekart] auth failure #${attempt} no token in response durationMs=${elapsedMs} requestId=${correlationId}`
    );
    throw new AppError(502, "Ekart auth: no token in response");
  }

  lastAuthAt = new Date();
  lastRefreshAt = lastAuthAt;
  console.info(
    `[ekart] auth success #${attempt} durationMs=${elapsedMs} requestId=${correlationId}`
  );
  return token;
}

function getClient(): ProviderHttpClient {
  assertEkartAllowed();
  if (!client) {
    client = createProviderHttpClient({
      providerId: "ekart",
      baseUrl: ekartConfig.baseUrl,
      requestTimeoutMs: ekartConfig.requestTimeoutMs,
      maxTransientRetries: ekartConfig.maxTransientRetries,
      tokenCacheTtlMinutes: ekartConfig.tokenCacheTtlMinutes,
      debugLogs: ekartConfig.debugLogs,
      maxConcurrentRequests: ekartConfig.maxConcurrentRequests,
      alwaysLogRequests: true,
      fetchToken: fetchNewToken,
      authHeaders: (token) => ({
        Authorization: `Bearer ${token}`,
        HTTP_X_MERCHANT_CODE: ekartConfig.merchantCode,
        "Content-Type": "application/json",
      }),
      onTokenInvalidate: () => {
        lastRefreshAt = new Date();
      },
      onRequestComplete: (info) => {
        lastRequestRetryCount = info.retryCount;
        totalRequestRetries += info.retryCount;
      },
    });
  }
  return client;
}

export async function ensureEkartAuth(): Promise<void> {
  await getClient().ensureAuth();
}

export function invalidateEkartToken(): void {
  client?.invalidateToken();
}

export async function ekartPost<T>(
  endpoint: string,
  body?: unknown,
  opts?: { retryable?: boolean; correlationId?: string; headers?: Record<string, string> }
): Promise<T> {
  return getClient().post<T>(endpoint, body, {
    retryable: opts?.retryable,
    correlationId: opts?.correlationId,
    headers: opts?.headers,
  });
}

export async function ekartPut<T>(
  endpoint: string,
  body?: unknown,
  opts?: { retryable?: boolean; correlationId?: string; headers?: Record<string, string> }
): Promise<T> {
  return getClient().request<T>(endpoint, {
    method: "PUT",
    body,
    retryable: opts?.retryable ?? false,
    correlationId: opts?.correlationId,
    headers: opts?.headers,
  });
}

export async function ekartGet<T>(
  endpoint: string,
  opts?: { retryable?: boolean; correlationId?: string }
): Promise<T> {
  return getClient().get<T>(endpoint, {
    retryable: opts?.retryable ?? true,
    correlationId: opts?.correlationId,
  });
}

export function getEkartAuthMetrics(): EkartAuthMetrics {
  const cache = client?.getAuthCacheInfo();
  return {
    lastAuthAt: lastAuthAt?.toISOString() ?? null,
    lastRefreshAt: lastRefreshAt?.toISOString() ?? null,
    lastAuthLatencyMs,
    lastRequestRetryCount,
    totalRequestRetries,
    cacheExpiresAt: cache?.cacheExpiresAt ?? null,
    uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000),
    apiVersion: EKART_API_VERSION,
  };
}

export async function probeEkartHealth(): Promise<{
  healthy: boolean;
  configured: boolean;
  enabled: boolean;
  message?: string;
  authLatencyMs?: number | null;
}> {
  if (!isEkartEnabledFlag()) {
    return { healthy: false, configured: false, enabled: false, message: "EKART_ENABLED is false" };
  }
  if (!isEkartConfigured()) {
    return {
      healthy: false,
      configured: false,
      enabled: true,
      message: "Missing EKART_AUTHORIZATION or EKART_MERCHANT_CODE",
    };
  }
  try {
    const started = Date.now();
    await ensureEkartAuth();
    return {
      healthy: true,
      configured: true,
      enabled: true,
      authLatencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      healthy: false,
      configured: true,
      enabled: true,
      message: err instanceof Error ? err.message : String(err),
      authLatencyMs: lastAuthLatencyMs,
    };
  }
}

/** Test helper — reset in-memory client. */
export function resetEkartClientForTests(): void {
  client = null;
  loginAttemptCount = 0;
  lastAuthAt = null;
  lastRefreshAt = null;
  lastAuthLatencyMs = null;
  lastRequestRetryCount = 0;
  totalRequestRetries = 0;
}
