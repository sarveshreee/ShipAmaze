/**
 * Velocity Shipping – HTTP client.
 * Uses the shared courier provider HTTP stack (auth cache, timeouts, retries, request IDs).
 * Credentials are read from env only; they are never logged or sent to the frontend.
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import {
  createProviderHttpClient,
  logProviderAuthFailure,
  type ProviderHttpClient,
} from "../courier/http/providerHttpClient.js";
import { velocityConfig } from "./velocity.config.js";
import type { VelocityAuthResponse } from "./velocity.types.js";

let client: ProviderHttpClient | null = null;

function mapVelocityErrorMessage(rawMsg: string, data: unknown, _status: number): string {
  const isWarehouseNotFound =
    /WAREHOUSE_NOT_FOUND/i.test(rawMsg) ||
    (() => {
      try {
        return /WAREHOUSE_NOT_FOUND/i.test(JSON.stringify(data));
      } catch {
        return false;
      }
    })();

  if (isWarehouseNotFound) {
    return 'Pickup address not registered with Delhivery. Please go to Settings → Pickup Addresses, open the pickup address, and click "Re-sync to Velocity" to fix this.';
  }
  return rawMsg;
}

async function fetchNewToken(): Promise<string> {
  if (!velocityConfig.username || !velocityConfig.password) {
    throw new AppError(503, "Velocity integration is not configured (missing credentials).");
  }

  const url = `${velocityConfig.baseUrl}/custom/api/v1/auth-token`;
  if (velocityConfig.debugLogs) console.info("[velocity] fetching new auth token");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), velocityConfig.requestTimeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: velocityConfig.username,
        password: velocityConfig.password,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") {
      throw new AppError(
        504,
        `Velocity request timed out after ${velocityConfig.requestTimeoutMs}ms`
      );
    }
    throw new AppError(502, `Velocity network error: ${String(err)}`);
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const text = await res.text();
    logProviderAuthFailure("velocity", res.status, text, velocityConfig.debugLogs);
    throw new AppError(502, `Velocity auth failed (${res.status}). Check credentials and provider status.`);
  }

  const body = (await res.json()) as VelocityAuthResponse;
  if (!body.token) throw new AppError(502, "Velocity auth: no token in response");
  return body.token;
}

function getClient(): ProviderHttpClient {
  if (!client) {
    client = createProviderHttpClient({
      providerId: "velocity",
      baseUrl: velocityConfig.baseUrl,
      requestTimeoutMs: velocityConfig.requestTimeoutMs,
      maxTransientRetries: velocityConfig.maxTransientRetries,
      tokenCacheTtlMinutes: velocityConfig.tokenCacheTtlMinutes,
      debugLogs: velocityConfig.debugLogs,
      maxConcurrentRequests: Math.min(
        20,
        Math.max(1, parseInt(process.env.VELOCITY_MAX_CONCURRENT_REQUESTS || "6", 10) || 6)
      ),
      fetchToken: fetchNewToken,
      mapErrorMessage: mapVelocityErrorMessage,
    });
  }
  return client;
}

/** Invalidate cached token (call on 401 from any endpoint). */
export function invalidateToken() {
  getClient().invalidateToken();
}

/** Ensure a valid Velocity token is cached (used by CourierProvider.authenticate). */
export async function ensureVelocityAuth(): Promise<void> {
  await getClient().ensureAuth();
}

/** Generic POST helper — same contract as before the shared-client extraction. */
export async function velocityPost<T>(endpoint: string, body: unknown): Promise<T> {
  return getClient().post<T>(endpoint, body);
}
