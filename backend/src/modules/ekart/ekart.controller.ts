/**
 * Ekart health + metrics routes (admin).
 */

import type { Response } from "express";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { probeEkartHealth, getEkartAuthMetrics } from "./ekart.client.js";
import { getEkartBookingMetrics, getEkartTrackingMetrics } from "./ekart.metrics.js";
import { getEkartStatusSyncMetrics } from "./ekart.statusSyncMetrics.js";
import { isEkartConfigured, isEkartEnabledFlag, ekartConfig } from "./ekart.config.js";

export const getEkartHealth = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const probe = await probeEkartHealth();
  const syncHealth = getEkartStatusSyncMetrics();
  const auth = getEkartAuthMetrics();

  res.json({
    success: true,
    data: {
      provider: "ekart",
      enabled: isEkartEnabledFlag(),
      configured: isEkartConfigured(),
      healthy: probe.healthy && syncHealth.consecutiveFailures < 5,
      baseUrl: ekartConfig.baseUrl,
      apiVersion: auth.apiVersion,
      auth,
      booking: getEkartBookingMetrics(),
      tracking: getEkartTrackingMetrics(),
      statusSync: syncHealth,
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
