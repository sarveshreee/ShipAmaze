/**
 * Velocity Shipping – low-level HTTP client with in-memory token caching.
 *
 * Token is fetched once and re-used until it expires (default 22 h / 1320 min).
 * Credentials are read from env only; they are never logged or sent to the frontend.
 */

import { velocityConfig } from "./velocity.config.js";
import type { VelocityAuthResponse, VelocityProviderError } from "./velocity.types.js";
import { AppError } from "../../middleware/errorMiddleware.js";

interface TokenCache {
  token: string;
  expiresAt: number; // unix ms
}

let tokenCache: TokenCache | null = null;

// ─── Internal: auth token ────────────────────────────────

async function fetchNewToken(): Promise<string> {
  const url = `${velocityConfig.baseUrl}/custom/api/v1/auth-token`;
  console.info("[velocity] fetching new auth token");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: velocityConfig.username,
      password: velocityConfig.password,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(502, `Velocity auth failed (${res.status}): ${text}`);
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

  const token = await fetchNewToken();
  tokenCache = { token, expiresAt: now + ttlMs };
  return token;
}

/** Invalidate cached token (call on 401 from any endpoint). */
export function invalidateToken() {
  tokenCache = null;
}

// ─── Generic POST helper ─────────────────────────────────

export async function velocityPost<T>(endpoint: string, body: unknown): Promise<T> {
  const token = await getToken();
  const url = `${velocityConfig.baseUrl}${endpoint}`;

  console.info(`[velocity] POST ${endpoint}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AppError(502, `Velocity network error on ${endpoint}: ${String(err)}`);
  }

  // If token expired mid-session, refresh once and retry
  if (res.status === 401) {
    invalidateToken();
    const freshToken = await getToken();
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${freshToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  if (!res.ok) {
    console.error(`[velocity] ${endpoint} error ${res.status}`, typeof data === "object" ? data : raw);
    const providerError: VelocityProviderError = {
      success: false,
      message: extractVelocityMessage(data) || `Velocity error ${res.status}`,
      provider: "velocity",
      providerStatusCode: res.status,
      providerError: data,
    };
    // Map HTTP status codes to meaningful messages
    const status = mapHttpStatus(res.status);
    throw Object.assign(new AppError(status, providerError.message), providerError);
  }

  console.info(`[velocity] POST ${endpoint} → ${res.status}`);
  return data as T;
}

// ─── Helpers ─────────────────────────────────────────────

function extractVelocityMessage(data: unknown): string {
  if (typeof data === "string") return data;
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    const meta = d.meta as Record<string, unknown> | undefined;
    const metaMsg = meta?.message != null ? String(meta.message).trim() : "";
    if (metaMsg) return metaMsg;
    return String(d.message || d.error || d.detail || "");
  }
  return "";
}

function mapHttpStatus(velocityStatus: number): number {
  if (velocityStatus === 400) return 400;
  if (velocityStatus === 401) return 502; // auth failures are a gateway issue
  if (velocityStatus === 422) return 422;
  if (velocityStatus >= 500) return 502;
  return 502;
}
