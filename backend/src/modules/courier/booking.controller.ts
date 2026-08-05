/**
 * Provider-agnostic shipment create (Lorrigo via orchestrator).
 * Velocity single-order create remains on /api/velocity/forward/create.
 */

import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { Order, type IOrder } from "../../models/Order.js";
import { bookShipmentViaProvider } from "./bookShipment.js";
import {
  getCourierProvider,
  listConfiguredCourierProviders,
  listCourierProviders,
  resolveCourierProviderId,
} from "./providerRegistry.js";
import { getStaticProviderCapabilities, providerSupports } from "./capabilities.js";
import { getLorrigoBookingMetrics } from "../lorrigo/lorrigo.bookingMetrics.js";
import { getLorrigoNdrMetrics } from "../lorrigo/lorrigo.ndrMetrics.js";
import { getEkartBookingMetrics, getEkartTrackingMetrics } from "../ekart/ekart.metrics.js";
import { getEkartAuthMetrics } from "../ekart/ekart.client.js";
import { getEkartStatusSyncMetrics } from "../ekart/ekart.statusSyncMetrics.js";

function assertBookingOrderAccess(
  user: NonNullable<AuthRequest["user"]>,
  order: IOrder
): void {
  if (user.role === "admin") return;
  const uid = String(user._id);
  const owned =
    String(order.createdBy) === uid ||
    String(order.ownerUserId ?? "") === uid ||
    String(order.dropshipperId ?? "") === uid;
  if (!owned) throw new AppError(403, "Forbidden");
}

export const listProviders = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const registered = listCourierProviders();
  res.json({
    success: true,
    data: registered.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      configured: p.isConfigured(),
      capabilities: p.capabilities,
    })),
  });
});

export const createShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = req.body as Record<string, unknown>;
  const orderId = String(body.orderId ?? "").trim();
  const warehouseId = String(body.warehouseId ?? body.pickupAddressId ?? "").trim();
  const carrierId = String(body.carrier_id ?? body.courierId ?? "").trim();
  const courierName = String(body.courier_name ?? body.courierName ?? "").trim();
  const provider = resolveCourierProviderId(String(body.provider ?? body.courierProvider ?? ""));

  if (!orderId) throw new AppError(400, "orderId is required");
  if (!warehouseId || !mongoose.isValidObjectId(warehouseId)) {
    throw new AppError(400, "warehouseId (pickup address id) is required");
  }

  if (provider === "velocity") {
    throw new AppError(
      400,
      "Velocity shipments must be created via POST /api/velocity/forward/create (unchanged Velocity booking path)."
    );
  }

  const caps = getStaticProviderCapabilities(provider);
  if (!providerSupports(caps, "booking")) {
    throw new AppError(501, `${provider} booking is not available`);
  }

  const order = await Order.findOne({ orderId });
  if (!order) throw new AppError(404, "Order not found");
  assertBookingOrderAccess(req.user, order);

  const weight = Number(body.weight ?? order.weight);
  const length = Number(body.length ?? order.length ?? 10);
  const width = Number(body.width ?? order.width ?? order.breadth ?? 10);
  const height = Number(body.height ?? order.height ?? 10);

  const booking = await bookShipmentViaProvider({
    order,
    provider,
    pickupAddressId: warehouseId,
    courierId: carrierId || (provider === "ekart" ? "ekart" : ""),
    courierName: courierName || (provider === "ekart" ? "Ekart" : undefined),
    weightKg: weight,
    lengthCm: length,
    widthCm: width,
    heightCm: height,
    skipServiceability: body.skip_serviceability === true,
    userId: req.user._id,
  });

  res.json({
    success: true,
    data: {
      order_id: booking.providerOrderId,
      shipment_id: booking.providerShipmentId,
      awb_code: booking.awb,
      carrier_name: booking.courierName,
      carrier_id: booking.courierId,
      label_url: booking.labelUrl,
      shipping_charges: booking.freightCharge,
      status: booking.status,
      provider,
    },
    orderId: order.orderId,
  });
});

export const bookingMetrics = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      lorrigo: getLorrigoBookingMetrics(),
      ekart: {
        booking: getEkartBookingMetrics(),
        tracking: getEkartTrackingMetrics(),
        auth: getEkartAuthMetrics(),
        statusSync: getEkartStatusSyncMetrics(),
      },
    },
  });
});

/** Sync NDR from all configured providers that support NDR (controllers stay provider-agnostic). */
export const syncNdr = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const daysBackRaw = Number(body.daysBack);
  const daysBack = Number.isFinite(daysBackRaw) && daysBackRaw > 0 ? daysBackRaw : 120;

  const providers = listConfiguredCourierProviders().filter((p) => p.supportsNDR());
  const results: Record<string, unknown> = {};
  let upserted = 0;
  let fetched = 0;
  let errors = 0;
  let duplicatesSuppressed = 0;

  for (const p of providers) {
    try {
      const r = await p.syncNDR({ daysBack });
      results[p.id] = r;
      fetched += Number(r.fetched ?? 0);
      upserted += Number(r.upserted ?? 0);
      errors += Number(r.errors ?? 0);
      duplicatesSuppressed += Number(r.duplicatesSuppressed ?? 0);
    } catch (err) {
      errors += 1;
      results[p.id] = {
        errors: 1,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  res.json({
    success: true,
    fetched,
    upserted,
    errors,
    duplicatesSuppressed,
    providers: results,
  });
});

export const ndrMetrics = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      lorrigo: getLorrigoNdrMetrics(),
    },
  });
});

export const cancelShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = req.body as Record<string, unknown>;
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) throw new AppError(400, "orderId is required");

  const order = await Order.findOne({ orderId });
  if (!order) throw new AppError(404, "Order not found");
  assertBookingOrderAccess(req.user, order);

  const providerId = resolveCourierProviderId(order.courierProvider);
  const provider = getCourierProvider(providerId);
  if (!providerSupports(provider.capabilities, "cancel")) {
    throw new AppError(501, `${provider.displayName} cancel is not available`);
  }

  const providerOrderId =
    providerId === "lorrigo"
      ? String(order.lorrigoOrderId ?? "").trim()
      : String(order.velocityOrderId ?? "").trim();

  const result = await provider.cancelShipment({
    providerOrderId: providerOrderId || undefined,
    awbs: order.awb ? [order.awb] : undefined,
    reason: String(body.reason ?? "customer_request"),
  });

  // After successful provider cancel, move local order to Reship (rebookable), like Velocity sync.
  if (result.success) {
    order.shipmentCreated = false;
    order.awb = "";
    order.trackingId = undefined;
    order.shipmentId = undefined;
    if (providerId === "lorrigo") {
      order.lorrigoOrderId = undefined;
      order.lorrigoShipmentId = undefined;
    } else {
      order.velocityOrderId = undefined;
      order.velocityShipmentId = undefined;
    }
    order.labelUrl = undefined;
    order.trackingUrl = undefined;
    order.trackingActivities = undefined;
    order.bookingInProgress = false;
    order.status = "reship";
    order.shipmentStatus = "reship";
    const prev = order.statusHistory ?? [];
    order.statusHistory = [
      ...prev,
      {
        status: "reship",
        at: new Date(),
        updatedBy: req.user._id,
        note: `${providerId}_cancel_to_reship`,
      },
    ].slice(-50);
    if (typeof order.markModified === "function") order.markModified("statusHistory");
    await order.save();
  }

  res.json({ success: result.success, message: result.message, data: result });
});
