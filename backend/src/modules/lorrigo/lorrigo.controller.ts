import type { Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { Pickup } from "../../models/Pickup.js";
import { LORRIGO_API_VERSION, probeLorrigoAuth } from "./lorrigo.client.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag, lorrigoConfig } from "./lorrigo.config.js";
import { syncPickupToLorrigo } from "./lorrigo.pickupSync.js";
import { getLorrigoStatusSyncHealth } from "./lorrigo.statusSyncMetrics.js";
import { getLorrigoStatusSyncIntervalMs } from "./lorrigo.statusSync.js";
import { Order } from "../../models/Order.js";
import { TERMINAL_ORDER_STATUS_VALUES } from "../courier/statusNormalize.js";

/**
 * GET /api/lorrigo/status
 * Reports auth health + provider metadata without exposing tokens or credentials.
 */
export const getLorrigoStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const probe = await probeLorrigoAuth();
  const m = probe.metrics;
  const syncHealth = getLorrigoStatusSyncHealth();

  let activeShipments = syncHealth.activeShipments;
  try {
    activeShipments = await Order.countDocuments({
      courierProvider: "lorrigo",
      awb: { $exists: true, $nin: ["", null] },
      shipmentCreated: true,
      isJunk: { $ne: true },
      status: { $nin: TERMINAL_ORDER_STATUS_VALUES },
    });
  } catch {
    /* keep metric snapshot */
  }

  res.json({
    success: true,
    provider: "lorrigo",
    status: probe.status,
    enabled: probe.enabled,
    configured: probe.configured,
    authenticated: probe.authenticated,
    healthy: probe.healthy && syncHealth.consecutiveFailures < 5,
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
    sync: {
      activeShipments,
      lastPollAt: syncHealth.lastPollAt,
      lastSuccessfulSyncAt: syncHealth.lastSuccessfulSyncAt,
      consecutiveFailures: syncHealth.consecutiveFailures,
      lastSyncLatencyMs: syncHealth.lastSyncLatencyMs,
      lastProviderLatencyMs: syncHealth.lastProviderLatencyMs,
      statusChanges: syncHealth.statusChanges,
      pollFailures: syncHealth.pollFailures,
      pollIntervalMs: getLorrigoStatusSyncIntervalMs(),
    },
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

/**
 * POST /api/lorrigo/pickups/:id/sync
 * Retry Lorrigo pickup sync only — never recreates the local pickup.
 */
export const retryPickupSync = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const pickupId = String(req.params.id ?? "").trim();
  if (!pickupId || !mongoose.isValidObjectId(pickupId)) {
    throw new AppError(400, "Invalid pickup id");
  }

  const pickup = await Pickup.findById(pickupId);
  if (!pickup || pickup.deletedAt) throw new AppError(404, "Pickup not found");

  const role = req.user.role;
  if (role !== "admin") {
    const ownerOk = String(pickup.userId) === String(req.user._id);
    if (!ownerOk) throw new AppError(403, "Forbidden");
  }

  console.info(`[lorrigo] pickup sync retry requested pickupId=${pickupId} by=${role}`);
  const result = await syncPickupToLorrigo(pickupId, { force: true });
  const fresh = await Pickup.findById(pickupId).lean();

  res.json({
    success: true,
    lorrigoSync: result,
    data: fresh
      ? {
          id: String(fresh._id),
          lorrigoPickupId: fresh.lorrigoPickupId,
          lorrigoSyncStatus: fresh.lorrigoSyncStatus,
          lorrigoLastSyncAt: fresh.lorrigoLastSyncAt
            ? new Date(fresh.lorrigoLastSyncAt).toISOString()
            : undefined,
          lorrigoSyncError: fresh.lorrigoSyncError,
        }
      : undefined,
  });
});
