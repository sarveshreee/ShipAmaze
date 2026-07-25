/**
 * Shared authenticated HTTP client for courier providers.
 * Provides token cache, 401 re-auth, timeouts, retries, request IDs, and sanitized logging.
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
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export interface ProviderHttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Extra headers (never put credentials here from callers that log). */
  headers?: Record<string, string>;
  /** Skip Authorization header (e.g. login endpoints). */
  skipAuth?: boolean;
}

export interface ProviderHttpClient {
  request<T>(endpoint: string, options?: ProviderHttpRequestOptions): Promise<T>;
  get<T>(endpoint: string, options?: Omit<ProviderHttpRequestOptions, "method" | "body">): Promise<T>;
  post<T>(endpoint: string, body?: unknown, options?: Omit<ProviderHttpRequestOptions, "method" | "body">): Promise<T>;
  ensureAuth(): Promise<void>;
  invalidateToken(): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function truncateForLog(s: string, max = 180): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function createProviderHttpClient(opts: ProviderHttpClientOptions): ProviderHttpClient {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  let tokenCache: TokenCache | null = null;
  let authPromise: Promise<string> | null = null;

  const logInfo = (msg: string) => {
    if (opts.debugLogs) console.info(msg);
  };

  const authHeaders =
    opts.authHeaders ??
    ((token: string) => ({
      Authorization: `Bearer ${token}`,
    }));

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
  ): Promise<T> {
    const method = options.method ?? (options.body !== undefined ? "POST" : "GET");
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const started = Date.now();
    logInfo(`[${opts.providerId}] ${method} ${endpoint} requestId=${requestId}`);

    const buildHeaders = async (): Promise<Record<string, string>> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        ...(options.headers ?? {}),
      };
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

    if (!res.ok) {
      const safeBody = sanitizeForProviderLog(data);
      if (opts.debugLogs) {
        console.error(
          `[${opts.providerId}] ${method} ${endpoint} error ${res.status} ${elapsedMs}ms requestId=${requestId}`,
          safeBody
        );
      } else {
        console.error(
          `[${opts.providerId}] ${method} ${endpoint} error ${res.status} ${elapsedMs}ms requestId=${requestId}`
        );
      }
      throw buildProviderAppError({
        provider: opts.providerId,
        providerStatus: res.status,
        data,
        requestId,
        mapMessage: opts.mapErrorMessage,
      });
    }

    logInfo(
      `[${opts.providerId}] ${method} ${endpoint} ok ${elapsedMs}ms requestId=${requestId}`
    );
    return data as T;
  }

  async function request<T>(
    endpoint: string,
    options: ProviderHttpRequestOptions = {}
  ): Promise<T> {
    const maxAttempts = opts.maxTransientRetries + 1;
    const requestId = randomUUID();
    let lastErr: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await requestOnce<T>(endpoint, options, requestId);
      } catch (err) {
        lastErr = err;
        const retryable = isRetryableProviderError(err);
        if (!retryable || attempt >= maxAttempts - 1) throw err;
        const backoff = 400 * (attempt + 1) + Math.floor(Math.random() * 200);
        logInfo(
          `[${opts.providerId}] retry ${endpoint} after ${backoff}ms (attempt ${attempt + 1}) requestId=${requestId}`
        );
        await sleep(backoff);
      }
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
