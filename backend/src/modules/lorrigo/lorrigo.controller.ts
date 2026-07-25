import type { Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { probeLorrigoAuth } from "./lorrigo.client.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag, lorrigoConfig } from "./lorrigo.config.js";

/**
 * GET /api/lorrigo/status
 * Reports auth health without exposing tokens or credentials.
 */
export const getLorrigoStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const probe = await probeLorrigoAuth();

  res.json({
    success: true,
    provider: "lorrigo",
    status: probe.status,
    enabled: probe.enabled,
    configured: probe.configured,
    baseUrl: lorrigoConfig.baseUrl,
    durationMs: probe.durationMs,
    message: probe.message,
    // Never include token
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
  });
});
