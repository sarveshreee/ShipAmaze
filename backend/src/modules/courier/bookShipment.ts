/**
 * Provider-routed shipment booking orchestrator.
 * Velocity booking remains in velocity.controller — this module handles Lorrigo
 * and exposes a single entry for callers that must not contain provider if/else business logic.
 */

import type { Types } from "mongoose";
import { AppError } from "../../middleware/errorMiddleware.js";
import { Order, type IOrder } from "../../models/Order.js";
import { Pickup } from "../../models/Pickup.js";
import { isRetryableProviderError } from "./http/providerErrors.js";
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
  recordDuplicateBookingAttempt,
} from "../lorrigo/lorrigo.bookingMetrics.js";
import { discoverServiceability } from "./discoverCouriers.js";

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

  if (order.shipmentCreated || String(order.awb || "").trim()) {
    recordDuplicateBookingAttempt();
    throw new AppError(409, "Order already has a shipment (duplicate booking blocked)");
  }
  if (String(order.lorrigoOrderId ?? "").trim() && String(order.awb || "").trim()) {
    recordDuplicateBookingAttempt();
    throw new AppError(409, "Order already booked on Lorrigo");
  }

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
  pickupLean: Record<string, unknown>
): void {
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
}

/**
 * Book a Lorrigo shipment for an order. Does not touch Velocity booking code.
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
  const { lorrigoPickupId, pickupLean } = await validateLorrigoBooking(input);
  recordBookingAttempt(0);

  // Idempotency token: persist intent before provider call when we already have a provider order id.
  if (String(input.order.lorrigoOrderId ?? "").trim() && !String(input.order.awb || "").trim()) {
    // Previous attempt may have succeeded remotely — try getShipment if AWB missing.
    try {
      const existing = await provider.getShipment({
        providerOrderId: String(input.order.lorrigoOrderId),
        awb: String(input.order.awb || "") || undefined,
      });
      if (existing.awb) {
        applyShipmentToOrder(input.order, existing, input, pickupLean);
        await input.order.save();
        recordBookingSuccess(Date.now() - started);
        return {
          awb: existing.awb,
          providerOrderId: existing.providerOrderId,
          providerShipmentId: existing.providerShipmentId,
          courierId: existing.courierId,
          courierName: existing.courierName,
          labelUrl: existing.labelUrl,
          freightCharge: existing.freightCharge,
          status: existing.status,
        };
      }
    } catch {
      /* proceed to create */
    }
  }

  const pay = paymentModeOf(input.order);
  const createInput: ProviderCreateShipmentInput = {
    orderId: input.order.orderId,
    pickupId: lorrigoPickupId,
    paymentMode: pay,
    orderAmount: Number(input.order.amount ?? 0) || 0,
    codAmount: pay === "cod" ? Number(input.order.amount ?? 0) : undefined,
    weightKg: input.weightKg,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    courierId: input.courierId,
    customer: {
      name: String(input.order.customer ?? ""),
      phone: String(input.order.customerPhone ?? input.order.phone ?? "").replace(/\D/g, "").slice(-10),
      email: input.order.customerEmail,
      address: String(input.order.shippingAddress1 ?? input.order.address ?? ""),
      city: String(input.order.shippingCity ?? input.order.city ?? ""),
      state: String(input.order.shippingState ?? input.order.state ?? ""),
      pincode: pin(input.order.shippingPincode ?? input.order.pincode),
      country: "India",
    },
    items: orderItems(input.order),
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
    },
  };

  let result: ProviderShipmentResult;
  try {
    result = await provider.createShipment(createInput);
  } catch (err) {
    // Retry once on transient errors only (never validation / duplicate).
    if (isRetryableProviderError(err)) {
      try {
        result = await provider.createShipment(createInput);
      } catch (err2) {
        recordBookingFailure(Date.now() - started);
        throw err2;
      }
    } else {
      recordBookingFailure(Date.now() - started);
      throw err;
    }
  }

  // Pre-mark provider ids before save for reconciliation if Mongo fails.
  input.order.lorrigoOrderId = result.providerOrderId || input.order.lorrigoOrderId;
  input.order.courierProvider = "lorrigo";

  applyShipmentToOrder(input.order, result, input, pickupLean);

  try {
    await input.order.save();
  } catch (saveErr) {
    input.order.bookingReconciliationRequired = true;
    console.error(
      `[CRITICAL] Lorrigo booking succeeded but Mongo save failed orderId=${input.order.orderId} ` +
        `awb=${result.awb} providerOrderId=${result.providerOrderId} error=${String(saveErr)}`
    );
    try {
      await Order.updateOne(
        { _id: input.order._id },
        {
          $set: {
            awb: result.awb,
            trackingId: result.awb,
            shipmentCreated: true,
            lorrigoOrderId: result.providerOrderId,
            lorrigoShipmentId: result.providerShipmentId,
            courierProvider: "lorrigo",
            labelUrl: result.labelUrl,
            bookingReconciliationRequired: true,
            bookedAt: new Date(),
            courierCompanyId: result.courierId ?? input.courierId,
            courierName: result.courierName ?? input.courierName,
          },
        }
      );
    } catch (updateErr) {
      console.error(
        `[CRITICAL] Lorrigo reconciliation update also failed orderId=${input.order.orderId} awb=${result.awb} error=${String(updateErr)}`
      );
    }
    recordBookingFailure(Date.now() - started);
    throw new AppError(
      500,
      `Shipment created on Lorrigo (AWB ${result.awb}) but failed to save locally. Reconciliation required.`
    );
  }

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

/** Thin router used by HTTP / process-selected for Lorrigo-only; Velocity callers stay on existing helpers. */
export async function bookShipmentViaProvider(
  input: BookShipmentInput
): Promise<BookShipmentResult> {
  if (input.provider === "lorrigo") {
    return bookLorrigoShipment(input);
  }
  throw new AppError(
    501,
    "Use the existing Velocity booking path for Velocity shipments (bookForwardShipmentForOrder)."
  );
}
