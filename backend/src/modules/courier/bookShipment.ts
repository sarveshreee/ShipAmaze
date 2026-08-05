/**
 * Provider-routed shipment booking orchestrator.
 * Velocity booking remains in velocity.controller — this module handles Lorrigo
 * and exposes a single entry for callers that must not contain provider if/else business logic.
 */

import type { Types } from "mongoose";
import { AppError } from "../../middleware/errorMiddleware.js";
import { Order, type IOrder } from "../../models/Order.js";
import { Pickup } from "../../models/Pickup.js";
import { isTransientNetworkMessage } from "./http/providerErrors.js";
import { getCourierProvider } from "./providerRegistry.js";
import { providerSupports } from "./capabilities.js";
import type {
  CourierProviderId,
  ProviderCreateShipmentInput,
  ProviderShipmentResult,
} from "./types.js";
import {
  recordBookingAttempt,
  recordBookingFailure,
  recordBookingSuccess,
  recordBookingValidationFailure,
} from "../lorrigo/lorrigo.bookingMetrics.js";
import { recordEkartBookingValidationFailure } from "../ekart/ekart.metrics.js";
import { discoverServiceability } from "./discoverCouriers.js";
import { appendProviderEvent } from "./providerEvents.js";
import { CURRENT_BOOKING_VERSION, ensureCorrelationId } from "./correlation.js";
import {
  claimOrderForBooking,
  releaseBookingClaim,
} from "./bookingClaim.js";

export type BookShipmentInput = {
  order: IOrder;
  provider: CourierProviderId;
  pickupAddressId: string;
  courierId: string;
  courierName?: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  skipServiceability?: boolean;
  userId?: Types.ObjectId;
  /** Optional idempotency key for safe client retries. */
  idempotencyKey?: string;
};

export type BookShipmentResult = {
  awb: string;
  providerOrderId: string;
  providerShipmentId?: string;
  courierId?: string;
  courierName?: string;
  labelUrl?: string;
  freightCharge?: number;
  status?: string;
};

function pin(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 6);
}

function paymentModeOf(order: IOrder): "cod" | "prepaid" {
  return String(order.payment ?? "").toLowerCase().includes("cod") ? "cod" : "prepaid";
}

function orderItems(order: IOrder): ProviderCreateShipmentInput["items"] {
  const products = (order.products ?? order.items ?? order.orderItems ?? []) as Array<
    Record<string, unknown>
  >;
  if (!Array.isArray(products) || products.length === 0) {
    return [{ name: "Item", qty: 1, price: Number(order.amount ?? 0) || 0 }];
  }
  return products.map((p) => ({
    name: String(p.name ?? p.title ?? "Item"),
    qty: Number(p.qty ?? p.quantity ?? 1) || 1,
    price: Number(p.price ?? p.unitPrice ?? 0) || 0,
    sku: p.sku != null ? String(p.sku) : undefined,
    tax: p.tax != null ? Number(p.tax) : undefined,
  }));
}

function appendHistory(order: IOrder, status: string, note: string, userId?: Types.ObjectId) {
  const prev = order.statusHistory ?? [];
  order.statusHistory = [
    ...prev,
    { status, at: new Date(), updatedBy: userId, note },
  ].slice(-50);
}

/**
 * Validate local preconditions for Lorrigo booking. Never calls provider API.
 */
export async function validateLorrigoBooking(input: BookShipmentInput): Promise<{
  lorrigoPickupId: string;
  pickupLean: Record<string, unknown>;
}> {
  const { order } = input;
  // Duplicate / race protection is owned by claimOrderForBooking (atomic).

  if (!(input.weightKg > 0) || !Number.isFinite(input.weightKg)) {
    recordBookingValidationFailure();
    throw new AppError(400, "Invalid weight (must be > 0)");
  }
  for (const [label, v] of [
    ["length", input.lengthCm],
    ["width", input.widthCm],
    ["height", input.heightCm],
  ] as const) {
    if (!(v > 0) || !Number.isFinite(v)) {
      recordBookingValidationFailure();
      throw new AppError(400, `Invalid ${label} (must be > 0)`);
    }
  }

  if (!String(input.courierId ?? "").trim()) {
    recordBookingValidationFailure();
    throw new AppError(400, "courierId is required");
  }

  const toPin = pin(order.shippingPincode ?? order.pincode);
  if (toPin.length !== 6) {
    recordBookingValidationFailure();
    throw new AppError(400, "Order delivery pincode is invalid");
  }
  const address = String(order.shippingAddress1 ?? order.address ?? "").trim();
  if (!address) {
    recordBookingValidationFailure();
    throw new AppError(400, "Order delivery address is required");
  }
  const customer = String(order.customer ?? "").trim();
  const phone = String(order.customerPhone ?? order.phone ?? "").replace(/\D/g, "");
  if (!customer || phone.length < 10) {
    recordBookingValidationFailure();
    throw new AppError(400, "Order customer name and phone are required");
  }

  const pay = paymentModeOf(order);
  if (pay === "cod" && !(Number(order.amount) > 0)) {
    recordBookingValidationFailure();
    throw new AppError(400, "COD orders require a positive amount");
  }

  const pickup = await Pickup.findById(input.pickupAddressId).lean();
  if (!pickup || (pickup as { deletedAt?: Date }).deletedAt) {
    recordBookingValidationFailure();
    throw new AppError(404, "Pickup address not found");
  }
  const lorrigoPickupId = String((pickup as { lorrigoPickupId?: string }).lorrigoPickupId ?? "").trim();
  const syncStatus = String((pickup as { lorrigoSyncStatus?: string }).lorrigoSyncStatus ?? "");
  if (!lorrigoPickupId) {
    recordBookingValidationFailure();
    throw new AppError(
      422,
      "Pickup is not synced to Lorrigo. Sync the pickup address before booking."
    );
  }
  if (syncStatus === "FAILED") {
    recordBookingValidationFailure();
    throw new AppError(422, "Pickup Lorrigo sync failed. Retry sync before booking.");
  }

  const fromPin = pin((pickup as { pincode?: string }).pincode);
  if (fromPin.length !== 6) {
    recordBookingValidationFailure();
    throw new AppError(400, "Pickup pincode is invalid");
  }

  if (!input.skipServiceability) {
    const svc = await discoverServiceability(
      {
        fromPincode: fromPin,
        toPincode: toPin,
        paymentMode: pay,
        weightKg: input.weightKg,
        lengthCm: input.lengthCm,
        widthCm: input.widthCm,
        heightCm: input.heightCm,
        collectableAmount: pay === "cod" ? Number(order.amount) : undefined,
      },
      { mode: "lorrigo" }
    );
    const ok = svc.couriers.some((c) => String(c.courierId) === String(input.courierId));
    if (!ok) {
      recordBookingValidationFailure();
      throw new AppError(422, "Selected Lorrigo courier is not serviceable for this lane");
    }
  }

  return { lorrigoPickupId, pickupLean: pickup as Record<string, unknown> };
}

function applyShipmentToOrder(
  order: IOrder,
  result: ProviderShipmentResult,
  input: BookShipmentInput,
  pickupLean: Record<string, unknown>,
  opts?: { correlationId?: string; durationMs?: number }
): void {
  const correlationId = opts?.correlationId ?? ensureCorrelationId(order);
  order.correlationId = correlationId;
  order.bookingVersion = order.bookingVersion ?? CURRENT_BOOKING_VERSION;
  order.courierProvider = "lorrigo";
  order.awb = result.awb;
  order.trackingId = result.awb;
  order.shipmentCreated = true;
  order.lorrigoOrderId = result.providerOrderId || order.lorrigoOrderId;
  order.lorrigoShipmentId = result.providerShipmentId || order.lorrigoShipmentId;
  order.shipmentId = result.providerShipmentId || result.providerOrderId || order.shipmentId;
  order.courierCompanyId = result.courierId ?? input.courierId;
  order.courierName = result.courierName ?? input.courierName ?? order.courierName;
  order.courier = order.courierName || order.courier;
  if (result.labelUrl) order.labelUrl = result.labelUrl;
  if (result.freightCharge != null) {
    order.shippingCharges = result.freightCharge;
    order.velocityFreightCost = result.freightCharge;
  }
  order.shipmentStatus = result.status || "pending_pickup";
  order.assignedDateTime = new Date();
  order.bookedAt = new Date();
  order.providerBookingRaw = result.raw as Record<string, unknown> | undefined;
  order.bookingReconciliationRequired = false;

  order.pickupAddressId = order.pickupAddressId;
  order.pickupWarehouseId = input.pickupAddressId;
  order.pickupAddress = {
    id: input.pickupAddressId,
    label: String(pickupLean.label ?? ""),
    contactName: String(pickupLean.contactName ?? ""),
    phone: String(pickupLean.phone ?? ""),
    email: String(pickupLean.email ?? ""),
    address: String(pickupLean.addressLine1 ?? ""),
    city: String(pickupLean.city ?? ""),
    state: String(pickupLean.state ?? ""),
    pincode: String(pickupLean.pincode ?? ""),
    country: String(pickupLean.country ?? "India"),
  };

  if (order.status !== "pending_pickup" && order.status !== "pending-pickup") {
    appendHistory(order, "pending_pickup", "Booked via Lorrigo", input.userId);
    order.status = "pending_pickup";
  }

  appendProviderEvent(order, {
    provider: "lorrigo",
    type: "BOOKING_RESPONSE",
    status: "SUCCESS",
    durationMs: opts?.durationMs,
    correlationId,
    message: `AWB ${result.awb}`,
    metadata: {
      providerOrderId: result.providerOrderId,
      providerShipmentId: result.providerShipmentId,
      bookingVersion: order.bookingVersion,
    },
  });
}

function resultFromOrder(order: IOrder): BookShipmentResult {
  return {
    awb: String(order.awb ?? ""),
    providerOrderId: String(order.lorrigoOrderId ?? ""),
    providerShipmentId: order.lorrigoShipmentId,
    courierId: order.courierCompanyId != null ? String(order.courierCompanyId) : undefined,
    courierName: order.courierName,
    labelUrl: order.labelUrl,
    freightCharge: order.shippingCharges,
    status: order.shipmentStatus,
  };
}

/**
 * True only for failures that likely happened before the provider accepted the request.
 * Timeouts / aborts are NOT safe to recreate — the provider may already have booked.
 */
function isSafePreAckNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  if (m.includes("timeout") || m.includes("abort")) return false;
  return (
    m.includes("econnrefused") ||
    m.includes("enotfound") ||
    m.includes("dns") ||
    m.includes("network error")
  );
}

/**
 * Book a Lorrigo shipment for an order. Does not touch Velocity booking code.
 * Uses atomic claim + idempotency; never blindly retries create after possible ack.
 */
export async function bookLorrigoShipment(input: BookShipmentInput): Promise<BookShipmentResult> {
  const provider = getCourierProvider("lorrigo");
  if (!providerSupports(provider.capabilities, "booking")) {
    throw new AppError(501, "Lorrigo booking is not enabled for this provider");
  }
  if (!provider.isConfigured()) {
    throw new AppError(503, "Lorrigo is not configured");
  }

  const started = Date.now();
  const correlationId = ensureCorrelationId(input.order);

  // Atomic claim first — prevents races and enables idempotent replay.
  const claim = await claimOrderForBooking({
    orderId: input.order.orderId,
    provider: "lorrigo",
    idempotencyKey: input.idempotencyKey,
    correlationId,
  });

  const order = claim.order;
  input.order = order;

  if (claim.reusedExisting && (order.shipmentCreated || String(order.awb || "").trim())) {
    recordBookingSuccess(Date.now() - started);
    console.info(
      `[lorrigo] booking idempotent reuse correlationId=${correlationId} orderId=${order.orderId} awb=${order.awb}`
    );
    return resultFromOrder(order);
  }

  let lorrigoPickupId: string;
  let pickupLean: Record<string, unknown>;
  try {
    const validated = await validateLorrigoBooking(input);
    lorrigoPickupId = validated.lorrigoPickupId;
    pickupLean = validated.pickupLean;
  } catch (err) {
    await releaseBookingClaim(order.orderId);
    throw err;
  }

  order.bookingVersion = CURRENT_BOOKING_VERSION;
  recordBookingAttempt(0);

  appendProviderEvent(order, {
    provider: "lorrigo",
    type: "BOOKING_REQUEST",
    status: "PENDING",
    correlationId,
    metadata: {
      courierId: input.courierId,
      pickupAddressId: input.pickupAddressId,
      idempotencyKey: claim.idempotencyKey,
    },
  });
  console.info(
    `[lorrigo] booking correlationId=${correlationId} orderId=${order.orderId} ` +
      `idempotencyKey=${claim.idempotencyKey} bookingVersion=${CURRENT_BOOKING_VERSION} provider=lorrigo`
  );

  // Reconcile prior partial success before creating.
  if (String(order.lorrigoOrderId ?? "").trim() && !String(order.awb || "").trim()) {
    try {
      const existing = await provider.getShipment({
        providerOrderId: String(order.lorrigoOrderId),
        awb: String(order.awb || "") || undefined,
      });
      if (existing.awb) {
        applyShipmentToOrder(order, existing, input, pickupLean, {
          correlationId,
          durationMs: Date.now() - started,
        });
        order.bookingInProgress = false;
        await order.save();
        recordBookingSuccess(Date.now() - started);
        return resultFromOrder(order);
      }
    } catch {
      /* proceed to create */
    }
  }

  const pay = paymentModeOf(order);
  const createInput: ProviderCreateShipmentInput = {
    orderId: order.orderId,
    pickupId: lorrigoPickupId,
    paymentMode: pay,
    orderAmount: Number(order.amount ?? 0) || 0,
    codAmount: pay === "cod" ? Number(order.amount ?? 0) : undefined,
    weightKg: input.weightKg,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    courierId: input.courierId,
    customer: {
      name: String(order.customer ?? ""),
      phone: String(order.customerPhone ?? order.phone ?? "").replace(/\D/g, "").slice(-10),
      email: order.customerEmail,
      address: String(order.shippingAddress1 ?? order.address ?? ""),
      city: String(order.shippingCity ?? order.city ?? ""),
      state: String(order.shippingState ?? order.state ?? ""),
      pincode: pin(order.shippingPincode ?? order.pincode),
      country: "India",
    },
    items: orderItems(order),
    providerPayload: {
      pickupName: pickupLean.label,
      contactPerson: pickupLean.contactName,
      pickupPhone: pickupLean.phone,
      pickupStreet: [pickupLean.addressLine1, pickupLean.addressLine2].filter(Boolean).join(", "),
      pickupPincode: pickupLean.pincode,
      pickupCity: pickupLean.city,
      pickupState: pickupLean.state,
      pickupAddress: {
        facilityName: pickupLean.label,
        contactPersonName: pickupLean.contactName,
        phone: pickupLean.phone,
        address: pickupLean.addressLine1,
        pincode: pickupLean.pincode,
        city: pickupLean.city,
        state: pickupLean.state,
        pickupAddressId: lorrigoPickupId,
      },
      idempotencyKey: claim.idempotencyKey,
      correlationId,
    },
  };

  let result: ProviderShipmentResult;
  try {
    // HTTP client does not retry POST. App layer: create once; on uncertain failure reconcile only.
    result = await provider.createShipment(createInput);
  } catch (err) {
    // After possible provider ack (timeout): never recreate — try getShipment by merchant order id.
    const maybeAcked =
      err instanceof AppError &&
      (err.statusCode === 504 || isTransientNetworkMessage(err.message));

    if (maybeAcked) {
      try {
        const recovered = await provider.getShipment({
          providerOrderId: String(order.lorrigoOrderId ?? "") || undefined,
        });
        if (recovered.awb) {
          result = recovered;
        } else if (isSafePreAckNetworkFailure(err)) {
          // Extremely narrow: connection never established — safe single recreate.
          result = await provider.createShipment(createInput);
        } else {
          order.bookingReconciliationRequired = true;
          appendProviderEvent(order, {
            provider: "lorrigo",
            type: "BOOKING_FAILED",
            status: "FAILED",
            durationMs: Date.now() - started,
            correlationId,
            message: "Uncertain booking state after provider timeout — reconcile required",
          });
          await order.save().catch(() => undefined);
          await releaseBookingClaim(order.orderId);
          recordBookingFailure(Date.now() - started);
          throw Object.assign(
            new AppError(
              504,
              "Shipment booking timed out. Do not retry blindly — check order status or contact support."
            ),
            {
              provider: "lorrigo",
              code: "BOOKING_UNCERTAIN",
              retryable: false,
              correlationId,
            }
          );
        }
      } catch (inner) {
        if (inner instanceof AppError && (inner as { code?: string }).code === "BOOKING_UNCERTAIN") {
          throw inner;
        }
        await releaseBookingClaim(order.orderId);
        recordBookingFailure(Date.now() - started);
        throw err;
      }
    } else {
      recordBookingFailure(Date.now() - started);
      appendProviderEvent(order, {
        provider: "lorrigo",
        type: "BOOKING_FAILED",
        status: "FAILED",
        durationMs: Date.now() - started,
        correlationId,
        message: err instanceof Error ? err.message : String(err),
      });
      try {
        await order.save();
      } catch {
        /* best effort */
      }
      await releaseBookingClaim(order.orderId);
      throw err;
    }
  }

  order.lorrigoOrderId = result.providerOrderId || order.lorrigoOrderId;
  order.courierProvider = "lorrigo";
  order.bookingInProgress = false;

  applyShipmentToOrder(order, result, input, pickupLean, {
    correlationId,
    durationMs: Date.now() - started,
  });

  try {
    await order.save();
  } catch (saveErr) {
    order.bookingReconciliationRequired = true;
    appendProviderEvent(order, {
      provider: "lorrigo",
      type: "RECONCILIATION",
      status: "FAILED",
      correlationId,
      message: "Mongo save failed after provider booking success",
      metadata: { awb: result.awb, providerOrderId: result.providerOrderId },
    });
    console.error(
      `[CRITICAL] Lorrigo booking succeeded but Mongo save failed correlationId=${correlationId} orderId=${order.orderId} ` +
        `awb=${result.awb} providerOrderId=${result.providerOrderId} provider=lorrigo error=${String(saveErr)}`
    );
    try {
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            awb: result.awb,
            trackingId: result.awb,
            shipmentCreated: true,
            bookingInProgress: false,
            lorrigoOrderId: result.providerOrderId,
            lorrigoShipmentId: result.providerShipmentId,
            courierProvider: "lorrigo",
            correlationId,
            bookingVersion: CURRENT_BOOKING_VERSION,
            bookingIdempotencyKey: claim.idempotencyKey,
            labelUrl: result.labelUrl,
            bookingReconciliationRequired: true,
            bookedAt: new Date(),
            courierCompanyId: result.courierId ?? input.courierId,
            courierName: result.courierName ?? input.courierName,
            providerEvents: order.providerEvents,
          },
        }
      );
    } catch (updateErr) {
      console.error(
        `[CRITICAL] Lorrigo reconciliation update also failed correlationId=${correlationId} orderId=${order.orderId} awb=${result.awb} error=${String(updateErr)}`
      );
    }
    recordBookingFailure(Date.now() - started);
    throw new AppError(
      500,
      `Shipment created on Lorrigo (AWB ${result.awb}) but failed to save locally. Reconciliation required.`
    );
  }

  // Keep caller's order object in sync when it was a plain mock / separate ref.
  Object.assign(input.order, {
    awb: order.awb,
    shipmentCreated: order.shipmentCreated,
    lorrigoOrderId: order.lorrigoOrderId,
    lorrigoShipmentId: order.lorrigoShipmentId,
    labelUrl: order.labelUrl,
    bookingReconciliationRequired: order.bookingReconciliationRequired,
    courierProvider: order.courierProvider,
    correlationId: order.correlationId,
    bookingInProgress: false,
  });

  recordBookingSuccess(Date.now() - started);
  return {
    awb: result.awb,
    providerOrderId: result.providerOrderId,
    providerShipmentId: result.providerShipmentId,
    courierId: result.courierId,
    courierName: result.courierName,
    labelUrl: result.labelUrl,
    freightCharge: result.freightCharge,
    status: result.status,
  };
}

/** Thin router used by HTTP / process-selected for non-Velocity providers. */
export async function bookShipmentViaProvider(
  input: BookShipmentInput
): Promise<BookShipmentResult> {
  if (input.provider === "lorrigo") {
    return bookLorrigoShipment(input);
  }
  if (input.provider === "ekart") {
    return bookEkartShipment(input);
  }
  throw new AppError(
    501,
    "Use the existing Velocity booking path for Velocity shipments (bookForwardShipmentForOrder)."
  );
}

/**
 * Validate local preconditions for Ekart booking. Never calls provider API.
 * No provider pickup id required — ShipAmaze Pickup address is mapped at create time.
 */
export async function validateEkartBooking(input: BookShipmentInput): Promise<{
  pickupLean: Record<string, unknown>;
}> {
  const { order } = input;

  if (!(input.weightKg > 0) || !Number.isFinite(input.weightKg)) {
    recordEkartBookingValidationFailure();
    throw new AppError(400, "Invalid weight (must be > 0)");
  }
  for (const [label, v] of [
    ["length", input.lengthCm],
    ["width", input.widthCm],
    ["height", input.heightCm],
  ] as const) {
    if (!(v > 0) || !Number.isFinite(v)) {
      recordEkartBookingValidationFailure();
      throw new AppError(400, `Invalid ${label} (must be > 0)`);
    }
  }

  const toPin = pin(order.shippingPincode ?? order.pincode);
  if (toPin.length !== 6) {
    recordEkartBookingValidationFailure();
    throw new AppError(400, "Order delivery pincode is invalid");
  }
  const address = String(order.shippingAddress1 ?? order.address ?? "").trim();
  if (!address) {
    recordEkartBookingValidationFailure();
    throw new AppError(400, "Order delivery address is required");
  }
  const customer = String(order.customer ?? "").trim();
  const phone = String(order.customerPhone ?? order.phone ?? "").replace(/\D/g, "");
  if (!customer || phone.length < 10) {
    recordEkartBookingValidationFailure();
    throw new AppError(400, "Order customer name and phone are required");
  }

  const pay = paymentModeOf(order);
  if (pay === "cod" && !(Number(order.amount) > 0)) {
    recordEkartBookingValidationFailure();
    throw new AppError(400, "COD orders require a positive amount");
  }

  const pickup = await Pickup.findById(input.pickupAddressId).lean();
  if (!pickup || (pickup as { deletedAt?: Date }).deletedAt) {
    recordEkartBookingValidationFailure();
    throw new AppError(404, "Pickup address not found");
  }

  const fromPin = pin((pickup as { pincode?: string }).pincode);
  if (fromPin.length !== 6) {
    recordEkartBookingValidationFailure();
    throw new AppError(400, "Pickup pincode is invalid");
  }
  const line1 = String((pickup as { addressLine1?: string }).addressLine1 ?? "").trim();
  if (!line1) {
    recordEkartBookingValidationFailure();
    throw new AppError(400, "Pickup address line 1 is required for Ekart booking");
  }

  if (!input.skipServiceability) {
    const svc = await discoverServiceability(
      {
        fromPincode: fromPin,
        toPincode: toPin,
        paymentMode: pay,
        weightKg: input.weightKg,
        lengthCm: input.lengthCm,
        widthCm: input.widthCm,
        heightCm: input.heightCm,
        collectableAmount: pay === "cod" ? Number(order.amount) : undefined,
      },
      { mode: "ekart" }
    );
    const wanted = String(input.courierId ?? "").trim();
    if (wanted) {
      const ok = svc.couriers.some((c) => String(c.courierId) === wanted);
      if (!ok && svc.couriers.length > 0) {
        recordEkartBookingValidationFailure();
        throw new AppError(422, "Selected Ekart courier is not serviceable for this lane");
      }
    }
  }

  return { pickupLean: pickup as Record<string, unknown> };
}

function applyEkartShipmentToOrder(
  order: IOrder,
  result: ProviderShipmentResult,
  input: BookShipmentInput,
  pickupLean: Record<string, unknown>,
  opts?: { correlationId?: string; durationMs?: number }
): void {
  const correlationId = opts?.correlationId ?? ensureCorrelationId(order);
  order.correlationId = correlationId;
  order.bookingVersion = order.bookingVersion ?? CURRENT_BOOKING_VERSION;
  order.courierProvider = "ekart";
  order.awb = result.awb;
  order.trackingId = result.awb;
  order.shipmentCreated = true;
  order.ekartTrackingId = result.awb;
  order.ekartRequestId = result.providerOrderId || order.ekartRequestId;
  order.shipmentId = result.providerShipmentId || result.providerOrderId || order.shipmentId;
  order.courierCompanyId = result.courierId ?? input.courierId ?? "ekart";
  order.courierName = result.courierName ?? input.courierName ?? "Ekart";
  order.courier = order.courierName || order.courier;
  if (result.labelUrl) order.labelUrl = result.labelUrl;
  if (result.freightCharge != null) {
    order.shippingCharges = result.freightCharge;
  }
  order.shipmentStatus = result.status || "pending_pickup";
  order.assignedDateTime = new Date();
  order.bookedAt = new Date();
  order.providerBookingRaw = result.raw as Record<string, unknown> | undefined;
  order.bookingReconciliationRequired = false;

  order.pickupWarehouseId = input.pickupAddressId;
  order.pickupAddress = {
    id: input.pickupAddressId,
    label: String(pickupLean.label ?? ""),
    contactName: String(pickupLean.contactName ?? ""),
    phone: String(pickupLean.phone ?? ""),
    email: String(pickupLean.email ?? ""),
    address: String(pickupLean.addressLine1 ?? ""),
    city: String(pickupLean.city ?? ""),
    state: String(pickupLean.state ?? ""),
    pincode: String(pickupLean.pincode ?? ""),
    country: String(pickupLean.country ?? "India"),
  };

  if (order.status !== "pending_pickup" && order.status !== "pending-pickup") {
    appendHistory(order, "pending_pickup", "Booked via Ekart", input.userId);
    order.status = "pending_pickup";
  }

  appendProviderEvent(order, {
    provider: "ekart",
    type: "BOOKING_RESPONSE",
    status: "SUCCESS",
    durationMs: opts?.durationMs,
    correlationId,
    message: `AWB ${result.awb}`,
    metadata: {
      providerOrderId: result.providerOrderId,
      providerShipmentId: result.providerShipmentId,
      bookingVersion: order.bookingVersion,
    },
  });
}

/**
 * Book an Ekart shipment. Maps ShipAmaze Pickup → source/return_location.
 * Does not create any Ekart pickup/warehouse.
 */
export async function bookEkartShipment(input: BookShipmentInput): Promise<BookShipmentResult> {
  const provider = getCourierProvider("ekart");
  if (!providerSupports(provider.capabilities, "booking")) {
    throw new AppError(501, "Ekart booking is not enabled for this provider");
  }
  if (!provider.isConfigured()) {
    throw new AppError(503, "Ekart is not configured");
  }

  const started = Date.now();
  const correlationId = ensureCorrelationId(input.order);

  const claim = await claimOrderForBooking({
    orderId: input.order.orderId,
    provider: "ekart",
    idempotencyKey: input.idempotencyKey,
    correlationId,
  });

  const order = claim.order;
  input.order = order;

  if (claim.reusedExisting && String(order.awb || "").trim()) {
    return {
      awb: String(order.awb),
      providerOrderId: String(order.ekartRequestId ?? order.ekartTrackingId ?? ""),
      providerShipmentId: order.ekartTrackingId,
      courierId: order.courierCompanyId != null ? String(order.courierCompanyId) : undefined,
      courierName: order.courierName,
      labelUrl: order.labelUrl,
      freightCharge: order.shippingCharges,
      status: order.shipmentStatus,
    };
  }

  let pickupLean: Record<string, unknown>;
  try {
    ({ pickupLean } = await validateEkartBooking({ ...input, order }));
  } catch (err) {
    await releaseBookingClaim(order.orderId);
    throw err;
  }

  const pay = paymentModeOf(order);
  const createInput: ProviderCreateShipmentInput = {
    orderId: order.orderId,
    pickupId: input.pickupAddressId,
    paymentMode: pay,
    orderAmount: Number(order.amount ?? 0) || 0,
    codAmount: pay === "cod" ? Number(order.amount ?? 0) : undefined,
    weightKg: input.weightKg,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    courierId: input.courierId || "ekart",
    customer: {
      name: String(order.customer ?? ""),
      phone: String(order.customerPhone ?? order.phone ?? "").replace(/\D/g, "").slice(-10),
      email: order.customerEmail,
      address: String(order.shippingAddress1 ?? order.address ?? ""),
      city: String(order.shippingCity ?? order.city ?? ""),
      state: String(order.shippingState ?? order.state ?? ""),
      pincode: pin(order.shippingPincode ?? order.pincode),
      country: "India",
    },
    items: orderItems(order),
    providerPayload: {
      pickupName: pickupLean.label,
      contactPerson: pickupLean.contactName,
      pickupPhone: pickupLean.phone,
      pickupEmail: pickupLean.email,
      pickupStreet: pickupLean.addressLine1,
      pickupStreet2: pickupLean.addressLine2,
      pickupLandmark: pickupLean.landmark,
      pickupPincode: pickupLean.pincode,
      pickupCity: pickupLean.city,
      pickupState: pickupLean.state,
      pickupCountry: pickupLean.country,
      ekartLocationCode: pickupLean.ekartLocationCode,
      pickupAddress: {
        label: pickupLean.label,
        contactName: pickupLean.contactName,
        phone: pickupLean.phone,
        email: pickupLean.email,
        addressLine1: pickupLean.addressLine1,
        addressLine2: pickupLean.addressLine2,
        landmark: pickupLean.landmark,
        city: pickupLean.city,
        state: pickupLean.state,
        pincode: pickupLean.pincode,
        country: pickupLean.country,
        ekartLocationCode: pickupLean.ekartLocationCode,
      },
      correlationId,
      idempotencyKey: claim.idempotencyKey,
    },
  };

  let result: ProviderShipmentResult;
  try {
    result = await provider.createShipment(createInput);
  } catch (err) {
    await releaseBookingClaim(order.orderId);
    appendProviderEvent(order, {
      provider: "ekart",
      type: "BOOKING_FAILED",
      status: "FAILED",
      durationMs: Date.now() - started,
      correlationId,
      message: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
    try {
      await order.save();
    } catch {
      /* ignore */
    }
    throw err;
  }

  applyEkartShipmentToOrder(order, result, input, pickupLean, {
    correlationId,
    durationMs: Date.now() - started,
  });
  order.bookingInProgress = false;

  try {
    await order.save();
  } catch (saveErr) {
    order.bookingReconciliationRequired = true;
    try {
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            awb: result.awb,
            trackingId: result.awb,
            shipmentCreated: true,
            bookingInProgress: false,
            ekartTrackingId: result.awb,
            ekartRequestId: result.providerOrderId,
            courierProvider: "ekart",
            correlationId,
            bookingVersion: CURRENT_BOOKING_VERSION,
            bookingReconciliationRequired: true,
            bookedAt: new Date(),
          },
        }
      );
    } catch {
      /* ignore */
    }
    throw new AppError(
      500,
      `Shipment created on Ekart (AWB ${result.awb}) but failed to save locally. Reconciliation required.`
    );
  }

  Object.assign(input.order, {
    awb: order.awb,
    shipmentCreated: order.shipmentCreated,
    ekartTrackingId: order.ekartTrackingId,
    ekartRequestId: order.ekartRequestId,
    courierProvider: order.courierProvider,
    correlationId: order.correlationId,
    bookingInProgress: false,
  });

  return {
    awb: result.awb,
    providerOrderId: result.providerOrderId,
    providerShipmentId: result.providerShipmentId,
    courierId: result.courierId,
    courierName: result.courierName,
    labelUrl: result.labelUrl,
    freightCharge: result.freightCharge,
    status: result.status,
  };
}
