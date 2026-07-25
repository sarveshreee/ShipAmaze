import type { Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { LORRIGO_API_VERSION, probeLorrigoAuth } from "./lorrigo.client.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag, lorrigoConfig } from "./lorrigo.config.js";

/**
 * GET /api/lorrigo/status
 * Reports auth health + provider metadata without exposing tokens or credentials.
 */
export const getLorrigoStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const probe = await probeLorrigoAuth();
  const m = probe.metrics;

  res.json({
    success: true,
    provider: "lorrigo",
    status: probe.status,
    enabled: probe.enabled,
    configured: probe.configured,
    authenticated: probe.authenticated,
    healthy: probe.healthy,
    baseUrl: lorrigoConfig.baseUrl,
    apiVersion: m.apiVersion || LORRIGO_API_VERSION,
    lastAuthAt: m.lastAuthAt,
    lastRefreshAt: m.lastRefreshAt,
    cacheExpiresAt: m.cacheExpiresAt,
    lastAuthLatencyMs: m.lastAuthLatencyMs,
    lastRequestRetryCount: m.lastRequestRetryCount,
    totalRequestRetries: m.totalRequestRetries,
    uptime: `${m.uptimeSeconds}s`,
    uptimeSeconds: m.uptimeSeconds,
    durationMs: probe.durationMs,
    message: probe.message,
    // Never include password, token, Authorization, or cookies
  });
});

/** Lightweight flag check for smoke tests (still admin-gated). */
export const getLorrigoHealth = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const enabled = isLorrigoEnabledFlag();
  res.json({
    success: true,
    provider: "lorrigo",
    status: enabled ? (isLorrigoConfigured() ? "enabled" : "enabled_unconfigured") : "disabled",
    enabled,
    configured: isLorrigoConfigured(),
    apiVersion: LORRIGO_API_VERSION,
  });
});
