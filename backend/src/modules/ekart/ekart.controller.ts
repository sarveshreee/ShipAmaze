/**
 * Ekart health + metrics routes (admin).
 */

import type { Response } from "express";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { Order } from "../../models/Order.js";
import { probeEkartHealth, getEkartAuthMetrics } from "./ekart.client.js";
import { getEkartBookingMetrics, getEkartTrackingMetrics } from "./ekart.metrics.js";
import { getEkartStatusSyncHealth } from "./ekart.statusSyncMetrics.js";
import { getEkartStatusSyncIntervalMs } from "./ekart.statusSync.js";
import { isEkartConfigured, isEkartEnabledFlag, ekartConfig } from "./ekart.config.js";
import { TERMINAL_ORDER_STATUS_VALUES } from "../courier/statusNormalize.js";

/**
 * GET /api/ekart/health
 * Auth status, API latency, tracking metrics, poll health — no credentials/tokens.
 */
export const getEkartHealth = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const probe = await probeEkartHealth();
  const syncHealth = getEkartStatusSyncHealth();
  const auth = getEkartAuthMetrics();
  const tracking = getEkartTrackingMetrics();

  let activeShipments = syncHealth.activeShipments;
  try {
    activeShipments = await Order.countDocuments({
      courierProvider: "ekart",
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
    data: {
      provider: "ekart",
      enabled: isEkartEnabledFlag(),
      configured: isEkartConfigured(),
      authenticated: Boolean(probe.healthy && probe.configured),
      healthy: probe.healthy && syncHealth.consecutiveFailures < 5,
      baseUrl: ekartConfig.baseUrl,
      apiVersion: auth.apiVersion,
      auth: {
        ...auth,
        lastAuthLatencyMs: probe.authLatencyMs ?? auth.lastAuthLatencyMs,
      },
      booking: getEkartBookingMetrics(),
      tracking: {
        ...tracking,
        successRate:
          tracking.successes + tracking.failures > 0
            ? tracking.successes / (tracking.successes + tracking.failures)
            : null,
      },
      statusSync: {
        activeShipments,
        lastPollAt: syncHealth.lastPollAt,
        lastSuccessfulSyncAt: syncHealth.lastSuccessfulSyncAt,
        consecutiveFailures: syncHealth.consecutiveFailures,
        lastSyncLatencyMs: syncHealth.lastSyncLatencyMs,
        lastProviderLatencyMs: syncHealth.lastProviderLatencyMs,
        statusChanges: syncHealth.statusChanges,
        pollFailures: syncHealth.pollFailures,
        polls: syncHealth.polls,
        pollIntervalMs: getEkartStatusSyncIntervalMs(),
      },
      capabilities: {
        pickupSync: false,
        createPickup: false,
        booking: true,
        tracking: true,
        rates: false,
        ndr: false,
        returns: false,
        labels: false,
        serviceability: true,
      },
      message: probe.message,
    },
  });
});
