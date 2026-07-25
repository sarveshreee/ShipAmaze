/**
 * Shared authenticated HTTP client for courier providers.
 * Provides token cache, 401 re-auth, timeouts, safe retries, request IDs, and sanitized logging.
 *
 * Retries: GET (idempotent) only by default. POST/PUT/PATCH never auto-retry
 * (prevents duplicate bookings). Explicit `retryable: true` opts in.
 */

import { randomUUID } from "crypto";
import { AppError } from "../../../middleware/errorMiddleware.js";
import type { CourierProviderId } from "../types.js";
import { buildProviderAppError, isRetryableProviderError } from "./providerErrors.js";
import { sanitizeForProviderLog } from "./sanitizeForProviderLog.js";

export interface ProviderHttpClientOptions {
  providerId: CourierProviderId | string;
  baseUrl: string;
  requestTimeoutMs: number;
  maxTransientRetries: number;
  tokenCacheTtlMinutes: number;
  debugLogs: boolean;
  /** Fetch a fresh auth token (never log credentials inside this callback). */
  fetchToken: () => Promise<string>;
  /** Build auth headers from a token. Default: Bearer. */
  authHeaders?: (token: string) => Record<string, string>;
  /** Optional friendly error rewriting (e.g. Velocity WAREHOUSE_NOT_FOUND). */
  mapErrorMessage?: (rawMsg: string, data: unknown, status: number) => string;
  /** Called when the cached token is cleared (401 refresh / explicit invalidate). */
  onTokenInvalidate?: () => void;
  /** When true, log every request with requestId/duration/retries (not only debug mode). */
  alwaysLogRequests?: boolean;
  /** Max in-flight requests for this client (provider concurrency limit). Default 6. */
  maxConcurrentRequests?: number;
  /** Optional hook after a finished request (success or failure). */
  onRequestComplete?: (info: {
    requestId: string;
    method: string;
    endpoint: string;
    durationMs: number;
    retryCount: number;
    ok: boolean;
    statusCode?: number;
  }) => void;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export interface ProviderAuthCacheInfo {
  hasToken: boolean;
  /** ISO timestamp when the in-memory token cache expires; null if none. */
  cacheExpiresAt: string | null;
}

export interface ProviderHttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Extra headers (never put credentials here from callers that log). */
  headers?: Record<string, string>;
  /** Skip Authorization header (e.g. login endpoints). */
  skipAuth?: boolean;
  /**
   * When true, allow transient retries. Defaults to true for GET only.
   * Booking POSTs must leave this false/undefined.
   */
  retryable?: boolean;
  correlationId?: string;
}

export interface ProviderHttpClient {
  request<T>(endpoint: string, options?: ProviderHttpRequestOptions): Promise<T>;
  get<T>(endpoint: string, options?: Omit<ProviderHttpRequestOptions, "method" | "body">): Promise<T>;
  post<T>(endpoint: string, body?: unknown, options?: Omit<ProviderHttpRequestOptions, "method" | "body">): Promise<T>;
  ensureAuth(): Promise<void>;
  invalidateToken(): void;
  getAuthCacheInfo(): ProviderAuthCacheInfo;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function truncateForLog(s: string, max = 180): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function parseRetryAfterMs(res: Response): number | undefined {
  const raw =
    typeof res.headers?.get === "function" ? res.headers.get("retry-after") : undefined;
  if (!raw) return undefined;
  const asInt = parseInt(raw, 10);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return Math.min(asInt * 1000, 60_000);
  }
  const when = Date.parse(raw);
  if (!Number.isNaN(when)) {
    return Math.min(Math.max(0, when - Date.now()), 60_000);
  }
  return undefined;
}

function backoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs != null && retryAfterMs > 0) return retryAfterMs;
  const exp = Math.min(8_000, 400 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 250);
  return exp + jitter;
}

export function createProviderHttpClient(opts: ProviderHttpClientOptions): ProviderHttpClient {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  let tokenCache: TokenCache | null = null;
  let authPromise: Promise<string> | null = null;
  const maxConcurrent = Math.max(1, opts.maxConcurrentRequests ?? 6);
  let inFlight = 0;
  const waitQueue: Array<() => void> = [];

  const debugLog = (msg: string) => {
    if (opts.debugLogs) console.info(msg);
  };
  const requestLog = (msg: string) => {
    if (opts.debugLogs || opts.alwaysLogRequests) console.info(msg);
  };

  const authHeaders =
    opts.authHeaders ??
    ((token: string) => ({
      Authorization: `Bearer ${token}`,
    }));

  async function acquireSlot(): Promise<void> {
    if (inFlight < maxConcurrent) {
      inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => waitQueue.push(resolve));
    inFlight += 1;
  }

  function releaseSlot(): void {
    inFlight = Math.max(0, inFlight - 1);
    const next = waitQueue.shift();
    if (next) next();
  }

  function invalidateToken() {
    const hadToken = !!tokenCache;
    tokenCache = null;
    if (hadToken) {
      opts.onTokenInvalidate?.();
    }
  }

  async function getToken(): Promise<string> {
    const now = Date.now();
    const ttlMs = opts.tokenCacheTtlMinutes * 60 * 1000;

    if (tokenCache && tokenCache.expiresAt > now + 60_000) {
      return tokenCache.token;
    }

    if (!authPromise) {
      authPromise = opts
        .fetchToken()
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

  async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.requestTimeoutMs);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") {
        throw new AppError(
          504,
          `${opts.providerId} request timed out after ${opts.requestTimeoutMs}ms`
        );
      }
      throw new AppError(502, `${opts.providerId} network error: ${String(err)}`);
    } finally {
      clearTimeout(t);
    }
  }

  async function requestOnce<T>(
    endpoint: string,
    options: ProviderHttpRequestOptions,
    requestId: string
  ): Promise<{ data: T; retryAfterMs?: number }> {
    const method = options.method ?? (options.body !== undefined ? "POST" : "GET");
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const started = Date.now();
    debugLog(`[${opts.providerId}] ${method} ${endpoint} attempt requestId=${requestId}`);

    const buildHeaders = async (): Promise<Record<string, string>> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        ...(options.headers ?? {}),
      };
      if (options.correlationId) {
        headers["X-Correlation-Id"] = options.correlationId;
      }
      if (!options.skipAuth) {
        const token = await getToken();
        Object.assign(headers, authHeaders(token));
      }
      return headers;
    };

    let headers = await buildHeaders();
    let res = await fetchWithTimeout(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!options.skipAuth && res.status === 401) {
      invalidateToken();
      headers = await buildHeaders();
      res = await fetchWithTimeout(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    }

    const raw = await res.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    const elapsedMs = Date.now() - started;
    const retryAfterMs = parseRetryAfterMs(res);

    if (!res.ok) {
      if (opts.debugLogs) {
        console.error(
          `[${opts.providerId}] ${method} ${endpoint} error ${res.status} ${elapsedMs}ms requestId=${requestId}`,
          sanitizeForProviderLog(data)
        );
      } else {
        console.error(
          `[${opts.providerId}] ${method} ${endpoint} error ${res.status} ${elapsedMs}ms requestId=${requestId}`
        );
      }
      const err = buildProviderAppError({
        provider: opts.providerId,
        providerStatus: res.status,
        data,
        requestId,
        correlationId: options.correlationId,
        mapMessage: opts.mapErrorMessage,
      });
      if (retryAfterMs != null) {
        Object.assign(err, { retryAfterMs });
      }
      throw err;
    }

    debugLog(
      `[${opts.providerId}] ${method} ${endpoint} attempt-ok ${elapsedMs}ms requestId=${requestId}`
    );
    return { data: data as T, retryAfterMs };
  }

  async function request<T>(
    endpoint: string,
    options: ProviderHttpRequestOptions = {}
  ): Promise<T> {
    const method = options.method ?? (options.body !== undefined ? "POST" : "GET");
    const allowRetry = options.retryable ?? method === "GET";
    const maxAttempts = allowRetry ? opts.maxTransientRetries + 1 : 1;
    const requestId = randomUUID();
    const started = Date.now();
    let lastErr: unknown;
    let retryCount = 0;

    requestLog(
      `[${opts.providerId}] ${method} ${endpoint} start requestId=${requestId}` +
        (options.correlationId ? ` correlationId=${options.correlationId}` : "")
    );

    await acquireSlot();
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const { data } = await requestOnce<T>(endpoint, options, requestId);
          const durationMs = Date.now() - started;
          requestLog(
            `[${opts.providerId}] ${method} ${endpoint} ok durationMs=${durationMs} retries=${retryCount} requestId=${requestId}`
          );
          opts.onRequestComplete?.({
            requestId,
            method,
            endpoint,
            durationMs,
            retryCount,
            ok: true,
          });
          return data;
        } catch (err) {
          lastErr = err;
          const retryable = allowRetry && isRetryableProviderError(err);
          if (!retryable || attempt >= maxAttempts - 1) {
            const durationMs = Date.now() - started;
            const statusCode =
              err instanceof AppError ? err.statusCode : undefined;
            requestLog(
              `[${opts.providerId}] ${method} ${endpoint} failed durationMs=${durationMs} retries=${retryCount} requestId=${requestId}`
            );
            opts.onRequestComplete?.({
              requestId,
              method,
              endpoint,
              durationMs,
              retryCount,
              ok: false,
              statusCode,
            });
            throw err;
          }
          retryCount += 1;
          const retryAfterMs =
            err && typeof err === "object" && "retryAfterMs" in err
              ? Number((err as { retryAfterMs?: number }).retryAfterMs)
              : undefined;
          const delay = backoffMs(attempt, retryAfterMs);
          requestLog(
            `[${opts.providerId}] retry ${endpoint} after ${delay}ms (attempt ${attempt + 1}) retriesSoFar=${retryCount} requestId=${requestId}`
          );
          await sleep(delay);
        }
      }
    } finally {
      releaseSlot();
    }

    throw lastErr;
  }

  return {
    request,
    get: (endpoint, options) => request(endpoint, { ...options, method: "GET" }),
    post: (endpoint, body, options) =>
      request(endpoint, { ...options, method: "POST", body }),
    ensureAuth: async () => {
      await getToken();
    },
    invalidateToken,
    getAuthCacheInfo: () => ({
      hasToken: !!tokenCache && tokenCache.expiresAt > Date.now(),
      cacheExpiresAt: tokenCache ? new Date(tokenCache.expiresAt).toISOString() : null,
    }),
  };
}

/** Helper for auth-token fetch logging without leaking secrets. */
export function logProviderAuthFailure(
  providerId: string,
  status: number,
  bodyText: string,
  debugLogs: boolean
): void {
  if (debugLogs) {
    console.info(
      `[${providerId}] auth failed status=${status} body=${truncateForLog(bodyText)}`
    );
  } else {
    console.error(`[${providerId}] auth failed status=${status}`);
  }
}
