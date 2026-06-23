/**
 * Velocity Shipping – HTTP client with deduplicated auth, timeouts, and bounded retries.
 * Credentials are read from env only; they are never logged or sent to the frontend.
 */

import { velocityConfig } from "./velocity.config.js";
import type { VelocityAuthResponse, VelocityProviderError } from "./velocity.types.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { sanitizeForVelocityLog } from "./velocity.payload.js";
import { isRetryableVelocityHttpStatus, isTransientNetworkMessage } from "./velocity.errors.js";
import { extractProviderErrorMessage } from "../../utils/errorMessage.js";

interface TokenCache {
  token: string;
  expiresAt: number; // unix ms
}

let tokenCache: TokenCache | null = null;
/** In-flight auth so concurrent requests share one token fetch. */
let authPromise: Promise<string> | null = null;

function logInfo(msg: string) {
  if (velocityConfig.debugLogs) console.info(msg);
}

function truncateForLog(s: string, max = 180): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

// ─── Internal: auth token ────────────────────────────────

async function fetchNewToken(): Promise<string> {
  if (!velocityConfig.username || !velocityConfig.password) {
    throw new AppError(503, "Velocity integration is not configured (missing credentials).");
  }

  const url = `${velocityConfig.baseUrl}/custom/api/v1/auth-token`;
  logInfo("[velocity] fetching new auth token");

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: velocityConfig.username,
      password: velocityConfig.password,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logInfo(`[velocity] auth failed status=${res.status} body=${truncateForLog(text)}`);
    throw new AppError(502, `Velocity auth failed (${res.status}). Check credentials and provider status.`);
  }

  const body = (await res.json()) as VelocityAuthResponse;
  if (!body.token) throw new AppError(502, "Velocity auth: no token in response");

  return body.token;
}

async function getToken(): Promise<string> {
  const now = Date.now();
  const ttlMs = velocityConfig.tokenCacheTtlMinutes * 60 * 1000;

  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  if (!authPromise) {
    authPromise = fetchNewToken()
      .then((token) => {
        tokenCache = { token, expiresAt: Date.now() + ttlMs };
        return token;
      })
      .finally(() => {
        authPromise = null;
      });
  }

  return authPromise;
}

/** Invalidate cached token (call on 401 from any endpoint). */
export function invalidateToken() {
  tokenCache = null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), velocityConfig.requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") {
      throw new AppError(504, `Velocity request timed out after ${velocityConfig.requestTimeoutMs}ms`);
    }
    throw new AppError(502, `Velocity network error: ${String(err)}`);
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Generic POST helper ─────────────────────────────────

export async function velocityPost<T>(endpoint: string, body: unknown): Promise<T> {
  const maxAttempts = velocityConfig.maxTransientRetries + 1;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await velocityPostOnce<T>(endpoint, body);
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableError(err);
      if (!retryable || attempt >= maxAttempts - 1) throw err;
      const backoff = 400 * (attempt + 1) + Math.floor(Math.random() * 200);
      logInfo(`[velocity] retry ${endpoint} after ${backoff}ms (attempt ${attempt + 1})`);
      await sleep(backoff);
    }
  }

  throw lastErr;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof AppError) {
    if (isRetryableVelocityHttpStatus(err.statusCode)) return true;
    if (err.statusCode === 504) return true;
    return isTransientNetworkMessage(err.message);
  }
  return false;
}

async function velocityPostOnce<T>(endpoint: string, body: unknown): Promise<T> {
  const url = `${velocityConfig.baseUrl}${endpoint}`;
  logInfo(`[velocity] POST ${endpoint}`);

  const doRequest = async (token: string) =>
    fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

  let token = await getToken();
  let res = await doRequest(token);

  if (res.status === 401) {
    invalidateToken();
    token = await getToken();
    res = await doRequest(token);
  }

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  if (!res.ok) {
    const safeBody = sanitizeForVelocityLog(data);
    if (velocityConfig.debugLogs) {
      console.error(`[velocity] ${endpoint} error ${res.status}`, safeBody);
    } else {
      console.error(`[velocity] ${endpoint} error ${res.status}`);
    }
    const rawMsg = extractProviderErrorMessage(data) || `Velocity error ${res.status}`;
    const isWarehouseNotFound = /WAREHOUSE_NOT_FOUND/i.test(rawMsg) ||
      (() => {
        try {
          return /WAREHOUSE_NOT_FOUND/i.test(JSON.stringify(data));
        } catch { return false; }
      })();
    const friendlyMsg = isWarehouseNotFound
      ? "Pickup address not registered with Delhivery. Please go to Settings → Pickup Addresses, open the pickup address, and click \"Re-sync to Velocity\" to fix this."
      : rawMsg;
    const providerError: VelocityProviderError = {
      success: false,
      message: friendlyMsg,
      provider: "velocity",
      providerStatusCode: res.status,
      providerError: data,
    };
    const status = mapHttpStatus(res.status);
    throw Object.assign(new AppError(status, providerError.message), providerError);
  }

  logInfo(`[velocity] POST ${endpoint} ok`);
  return data as T;
}

// ─── Helpers ─────────────────────────────────────────────

function mapHttpStatus(velocityStatus: number): number {
  if (velocityStatus === 400) return 400;
  if (velocityStatus === 401) return 502;
  if (velocityStatus === 422) return 422;
  if (velocityStatus === 429) return 429;
  if (velocityStatus >= 500) return 502;
  return 502;
}
