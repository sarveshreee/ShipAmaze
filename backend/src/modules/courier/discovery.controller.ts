/**
 * Multi-provider courier discovery HTTP handlers.
 * No provider-specific business logic — only validation + discoverCouriers.
 */

import type { Response } from "express";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { discoverRates, discoverServiceability } from "./discoverCouriers.js";
import { discoveryConfig } from "./discoveryConfig.js";
import { getDiscoveryMetricsSnapshot } from "./discoveryMetrics.js";
import type { CourierDiscoveryMode, ProviderPaymentMode } from "./types.js";

function parseMode(raw: unknown): CourierDiscoveryMode | undefined {
  if (raw == null || raw === "") return undefined;
  const v = String(raw).trim().toLowerCase();
  if (v === "velocity" || v === "lorrigo" || v === "both") return v;
  throw new AppError(400, "mode must be velocity | lorrigo | both");
}

function parsePaymentMode(raw: unknown): ProviderPaymentMode {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "cod" || v === "prepaid") return v;
  throw new AppError(400, "payment_mode (cod|prepaid) is required");
}

export const serviceability = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const from = body.from ?? body.fromPincode ?? body.origin;
  const to = body.to ?? body.toPincode ?? body.destination;
  if (!from || !to) throw new AppError(400, "from and to pincodes are required");

  const result = await discoverServiceability(
    {
      fromPincode: String(from),
      toPincode: String(to),
      paymentMode: parsePaymentMode(body.payment_mode ?? body.paymentMode),
      shipmentType:
        body.shipment_type === "return" || body.shipmentType === "return" ? "return" : "forward",
      weightKg: body.weight != null ? Number(body.weight) : body.weightKg != null ? Number(body.weightKg) : undefined,
      lengthCm: body.length != null ? Number(body.length) : body.lengthCm != null ? Number(body.lengthCm) : undefined,
      widthCm: body.width != null ? Number(body.width) : body.widthCm != null ? Number(body.widthCm) : undefined,
      heightCm: body.height != null ? Number(body.height) : body.heightCm != null ? Number(body.heightCm) : undefined,
      collectableAmount:
        body.cod_value != null
          ? Number(body.cod_value)
          : body.collectableAmount != null
            ? Number(body.collectableAmount)
            : undefined,
    },
    { mode: parseMode(body.mode) }
  );

  res.json({
    success: true,
    data: result.couriers,
    providers: result.providers,
    metrics: result.metrics,
    discoveryMode: parseMode(body.mode) ?? discoveryConfig.mode,
    serviceable: result.couriers.length > 0,
  });
});

export const rates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const from = body.from ?? body.fromPincode;
  const to = body.to ?? body.toPincode;
  if (!from || !to) throw new AppError(400, "from and to pincodes are required");

  const paymentMode = parsePaymentMode(body.payment_mode ?? body.paymentMode);
  const weight = Number(body.weight ?? body.weightKg);
  if (!(weight > 0)) throw new AppError(400, "weight (kg) is required and must be > 0");

  if (paymentMode === "cod") {
    const cod = Number(body.cod_value ?? body.codValue ?? body.collectableAmount);
    if (!(cod > 0)) throw new AppError(400, "cod_value is required for COD");
  }

  const result = await discoverRates(
    {
      fromPincode: String(from),
      toPincode: String(to),
      paymentMode,
      shipmentType:
        body.shipment_type === "return" || body.shipmentType === "return" ? "return" : "forward",
      weightKg: weight,
      lengthCm: Number(body.length ?? body.lengthCm ?? 10),
      widthCm: Number(body.width ?? body.widthCm ?? 10),
      heightCm: Number(body.height ?? body.heightCm ?? 10),
      codValue:
        body.cod_value != null
          ? Number(body.cod_value)
          : body.codValue != null
            ? Number(body.codValue)
            : undefined,
      collectableAmount:
        body.collectableAmount != null ? Number(body.collectableAmount) : undefined,
      qcApplicable: typeof body.qc_applicable === "boolean" ? body.qc_applicable : undefined,
    },
    { mode: parseMode(body.mode) }
  );

  res.json({
    success: true,
    data: result.couriers,
    providers: result.providers,
    metrics: result.metrics,
    discoveryMode: parseMode(body.mode) ?? discoveryConfig.mode,
  });
});

export const discoveryMetrics = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    data: getDiscoveryMetricsSnapshot(),
    config: {
      mode: discoveryConfig.mode,
      cacheTtlSeconds: discoveryConfig.cacheTtlSeconds,
      cacheEnabled: discoveryConfig.cacheEnabled,
    },
  });
});
