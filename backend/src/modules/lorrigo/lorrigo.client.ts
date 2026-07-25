/**
 * Lorrigo HTTP client — auth login + shared provider HTTP stack.
 * Never logs password, token, or Authorization headers.
 */

import { randomUUID } from "crypto";
import { AppError } from "../../middleware/errorMiddleware.js";
import {
  createProviderHttpClient,
  logProviderAuthFailure,
  type ProviderHttpClient,
} from "../courier/http/providerHttpClient.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag, lorrigoConfig } from "./lorrigo.config.js";

export interface LorrigoLoginResponse {
  token?: string;
  [key: string]: unknown;
}

export interface LorrigoAuthMetrics {
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
/** Lorrigo public API version used by this integration. */
export const LORRIGO_API_VERSION = "v2";

let client: ProviderHttpClient | null = null;
let loginAttemptCount = 0;
let lastAuthAt: Date | null = null;
let lastRefreshAt: Date | null = null;
let lastAuthLatencyMs: number | null = null;
let lastRequestRetryCount = 0;
let totalRequestRetries = 0;

function assertLorrigoAllowed(): void {
  if (!isLorrigoEnabledFlag()) {
    throw new AppError(503, "Lorrigo integration is disabled (LORRIGO_ENABLED is not true).");
  }
  if (!isLorrigoConfigured()) {
    throw new AppError(503, "Lorrigo integration is not configured (missing credentials).");
  }
}

async function fetchNewToken(): Promise<string> {
  assertLorrigoAllowed();

  loginAttemptCount += 1;
  const attempt = loginAttemptCount;
  const correlationId = randomUUID();
  const url = `${lorrigoConfig.baseUrl}/v2/auth/login`;
  const started = Date.now();

  console.info(
    `[lorrigo] login attempt #${attempt} email=${maskEmail(lorrigoConfig.email)} requestId=${correlationId}`
  );

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), lorrigoConfig.requestTimeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": correlationId,
      },
      body: JSON.stringify({
        email: lorrigoConfig.email,
        password: lorrigoConfig.password,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const elapsedMs = Date.now() - started;
    lastAuthLatencyMs = elapsedMs;
    if (name === "AbortError") {
      console.error(
        `[lorrigo] login failure #${attempt} timeout after ${elapsedMs}ms requestId=${correlationId}`
      );
      throw new AppError(
        504,
        `Lorrigo request timed out after ${lorrigoConfig.requestTimeoutMs}ms`
      );
    }
    console.error(
      `[lorrigo] login failure #${attempt} network error after ${elapsedMs}ms requestId=${correlationId}`
    );
    throw new AppError(502, `Lorrigo network error: ${String(err)}`);
  } finally {
    clearTimeout(t);
  }

  const elapsedMs = Date.now() - started;
  lastAuthLatencyMs = elapsedMs;

  if (!res.ok) {
    const text = await res.text();
    logProviderAuthFailure("lorrigo", res.status, text, lorrigoConfig.debugLogs);
    console.error(
      `[lorrigo] login failure #${attempt} status=${res.status} durationMs=${elapsedMs} requestId=${correlationId}`
    );
    throw new AppError(
      502,
      `Lorrigo auth failed (${res.status}). Check credentials and provider status.`
    );
  }

  let body: LorrigoLoginResponse;
  try {
    body = (await res.json()) as LorrigoLoginResponse;
  } catch {
    console.error(
      `[lorrigo] login failure #${attempt} invalid JSON durationMs=${elapsedMs} requestId=${correlationId}`
    );
    throw new AppError(502, "Lorrigo auth: invalid JSON response");
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    console.error(
      `[lorrigo] login failure #${attempt} no token in response durationMs=${elapsedMs} requestId=${correlationId}`
    );
    throw new AppError(502, "Lorrigo auth: no token in response");
  }

  lastAuthAt = new Date();
  console.info(
    `[lorrigo] login success #${attempt} durationMs=${elapsedMs} requestId=${correlationId}`
  );
  return token;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const l = local.length <= 2 ? "*" : `${local.slice(0, 1)}***${local.slice(-1)}`;
  return `${l}@${domain}`;
}

function getClient(): ProviderHttpClient {
  assertLorrigoAllowed();
  if (!client) {
    client = createProviderHttpClient({
      providerId: "lorrigo",
      baseUrl: lorrigoConfig.baseUrl,
      requestTimeoutMs: lorrigoConfig.requestTimeoutMs,
      maxTransientRetries: lorrigoConfig.maxTransientRetries,
      tokenCacheTtlMinutes: lorrigoConfig.tokenCacheTtlMinutes,
      debugLogs: lorrigoConfig.debugLogs,
      alwaysLogRequests: process.env.LORRIGO_ALWAYS_LOG_REQUESTS === "true",
      maxConcurrentRequests: Math.min(
        20,
        Math.max(1, parseInt(process.env.LORRIGO_MAX_CONCURRENT_REQUESTS || "6", 10) || 6)
      ),
      fetchToken: fetchNewToken,
      onTokenInvalidate: () => {
        lastRefreshAt = new Date();
        console.info("[lorrigo] token refresh: cache invalidated after 401 or explicit invalidate");
      },
      onRequestComplete: (info) => {
        lastRequestRetryCount = info.retryCount;
        totalRequestRetries += info.retryCount;
      },
    });
  }
  return client;
}

/** Reset singleton (tests / disable). */
export function resetLorrigoClientForTests(): void {
  client = null;
  loginAttemptCount = 0;
  lastAuthAt = null;
  lastRefreshAt = null;
  lastAuthLatencyMs = null;
  lastRequestRetryCount = 0;
  totalRequestRetries = 0;
}

export function invalidateLorrigoToken(): void {
  if (client) client.invalidateToken();
  else {
    lastRefreshAt = new Date();
    console.info("[lorrigo] token cache invalidated (refresh required)");
  }
}

export async function ensureLorrigoAuth(): Promise<void> {
  await getClient().ensureAuth();
}

/** Authenticated JSON request helpers for later phases. */
export async function lorrigoPost<T>(endpoint: string, body?: unknown): Promise<T> {
  return getClient().post<T>(endpoint, body);
}

export async function lorrigoGet<T>(endpoint: string): Promise<T> {
  return getClient().get<T>(endpoint);
}

export function getLorrigoAuthMetrics(): LorrigoAuthMetrics {
  const cache = client?.getAuthCacheInfo() ?? { hasToken: false, cacheExpiresAt: null };
  return {
    lastAuthAt: lastAuthAt?.toISOString() ?? null,
    lastRefreshAt: lastRefreshAt?.toISOString() ?? null,
    lastAuthLatencyMs,
    lastRequestRetryCount,
    totalRequestRetries,
    cacheExpiresAt: cache.cacheExpiresAt,
    uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000),
    apiVersion: LORRIGO_API_VERSION,
  };
}

/** Probe auth status without throwing for missing feature flag. */
export type LorrigoAuthProbeStatus =
  | "disabled"
  | "authenticated"
  | "failed_authentication";

export async function probeLorrigoAuth(): Promise<{
  status: LorrigoAuthProbeStatus;
  enabled: boolean;
  configured: boolean;
  authenticated: boolean;
  healthy: boolean;
  message?: string;
  durationMs?: number;
  metrics: LorrigoAuthMetrics;
}> {
  const metrics = getLorrigoAuthMetrics();

  if (!isLorrigoEnabledFlag()) {
    return {
      status: "disabled",
      enabled: false,
      configured: isLorrigoConfigured(),
      authenticated: false,
      healthy: false,
      metrics,
    };
  }

  if (!isLorrigoConfigured()) {
    return {
      status: "failed_authentication",
      enabled: true,
      configured: false,
      authenticated: false,
      healthy: false,
      message: "Missing LORRIGO_EMAIL or LORRIGO_PASSWORD",
      metrics,
    };
  }

  const started = Date.now();
  try {
    await ensureLorrigoAuth();
    return {
      status: "authenticated",
      enabled: true,
      configured: true,
      authenticated: true,
      healthy: true,
      durationMs: Date.now() - started,
      metrics: getLorrigoAuthMetrics(),
    };
  } catch (err) {
    const message =
      err instanceof AppError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Lorrigo authentication failed";
    return {
      status: "failed_authentication",
      enabled: true,
      configured: true,
      authenticated: false,
      healthy: false,
      message,
      durationMs: Date.now() - started,
      metrics: getLorrigoAuthMetrics(),
    };
  }
}
