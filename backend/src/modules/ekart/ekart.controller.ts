/**
 * Ekart health + metrics + Critical Updates webhook (admin / public webhook).
 */

import type { Response } from "express";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { Order } from "../../models/Order.js";
import {
  probeEkartHealth,
  getEkartAuthMetrics,
  EKART_API_PRODUCT,
  EKART_API_VERSION,
  EKART_OPENAPI_VERSION,
} from "./ekart.client.js";
import { getEkartBookingMetrics, getEkartTrackingMetrics } from "./ekart.metrics.js";
import { getEkartStatusSyncHealth } from "./ekart.statusSyncMetrics.js";
import { getEkartStatusSyncIntervalMs } from "./ekart.statusSync.js";
import { isEkartConfigured, isEkartEnabledFlag, ekartConfig } from "./ekart.config.js";
import { TERMINAL_ORDER_STATUS_VALUES } from "../courier/statusNormalize.js";
import { applyEkartCriticalUpdate, verifyEkartWebhookSecret } from "./ekart.webhooks.js";

/**
 * GET /api/ekart/health
 * Includes provider version metadata for debugging API upgrades.
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
      apiVersion: EKART_API_PRODUCT,
      apiVersionCode: EKART_API_VERSION,
      openApiVersion: EKART_OPENAPI_VERSION,
      merchantCode: ekartConfig.merchantCode || null,
      enabled: isEkartEnabledFlag(),
      configured: isEkartConfigured(),
      authenticated: Boolean(probe.healthy && probe.configured),
      healthy: probe.healthy && syncHealth.consecutiveFailures < 5,
      baseUrl: ekartConfig.baseUrl,
      auth: {
        ...auth,
        apiVersion: EKART_API_PRODUCT,
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
      webhooks: {
        enabled: ekartConfig.webhooksEnabled,
        secretConfigured: Boolean(ekartConfig.webhookSecret),
        note: "Polling remains source of truth; Critical Updates are optional.",
      },
      capabilities: {
        pickupSync: false,
        createPickup: false,
        booking: true,
        tracking: true,
        cancel: true,
        returns: true,
        rates: false,
        ndr: false,
        labels: false,
        serviceability: true,
        webhooks: ekartConfig.webhooksEnabled,
      },
      message: probe.message,
    },
  });
});

/**
 * POST /api/ekart/webhooks/critical-updates
 * Durin Critical Updates push target (enroll URL with Ekart). No JWT —
 * optional EKART_WEBHOOK_SECRET.
 */
export const postEkartCriticalUpdates = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isEkartEnabledFlag()) {
    throw new AppError(503, "Ekart integration is disabled");
  }
  if (!ekartConfig.webhooksEnabled) {
    throw new AppError(503, "Ekart webhooks are disabled (EKART_WEBHOOKS_ENABLED is not true)");
  }
  if (!verifyEkartWebhookSecret(req.headers as Record<string, unknown>)) {
    throw new AppError(401, "Invalid webhook secret");
  }

  const body = req.body;
  const events = Array.isArray(body) ? body : [body];
  const results = [];
  for (const event of events) {
    results.push(await applyEkartCriticalUpdate(event));
  }

  res.status(200).json({
    success: true,
    accepted: results.every((r) => r.accepted),
    results,
  });
});
