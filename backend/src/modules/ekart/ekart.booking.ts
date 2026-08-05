/**
 * Ekart booking — create shipment via Durin /v2/shipments/create.
 * Pickup address is mapped at booking time (no pickup sync).
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import { sanitizeForProviderLog } from "../courier/http/sanitizeForProviderLog.js";
import type {
  ProviderCreateShipmentInput,
  ProviderShipmentResult,
  ProviderTrackInput,
  ProviderTrackingResult,
  ProviderGetShipmentInput,
  ProviderCancelInput,
  ProviderCancelResult,
} from "../courier/types.js";
import { ekartConfig } from "./ekart.config.js";
import { ekartPost } from "./ekart.client.js";
import {
  buildEkartCreateShipmentPayload,
  parseEkartCreateResponse,
  type EkartPickupLean,
} from "./ekart.payload.js";
import { trackEkartShipment } from "./ekart.tracking.js";
import {
  recordEkartBookingAttempt,
  recordEkartBookingFailure,
  recordEkartBookingSuccess,
} from "./ekart.metrics.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function createEkartShipment(
  input: ProviderCreateShipmentInput
): Promise<ProviderShipmentResult> {
  const started = Date.now();
  recordEkartBookingAttempt(0);

  const pickupFromExtras = asRecord(input.providerPayload?.pickupAddress) as EkartPickupLean | null;
  const pickup: EkartPickupLean = pickupFromExtras ?? {
    label: String(input.providerPayload?.pickupName ?? "Pickup"),
    contactName: String(input.providerPayload?.contactPerson ?? "Contact"),
    phone: String(input.providerPayload?.pickupPhone ?? ""),
    email: String(input.providerPayload?.pickupEmail ?? ""),
    addressLine1: String(input.providerPayload?.pickupStreet ?? ""),
    addressLine2: String(input.providerPayload?.pickupStreet2 ?? ""),
    landmark: String(input.providerPayload?.pickupLandmark ?? ""),
    city: String(input.providerPayload?.pickupCity ?? ""),
    state: String(input.providerPayload?.pickupState ?? ""),
    pincode: String(input.providerPayload?.pickupPincode ?? ""),
    country: String(input.providerPayload?.pickupCountry ?? "India"),
    ekartLocationCode:
      typeof input.providerPayload?.ekartLocationCode === "string"
        ? input.providerPayload.ekartLocationCode
        : undefined,
  };

  const built = buildEkartCreateShipmentPayload({
    orderId: input.orderId,
    paymentMode: input.paymentMode,
    orderAmount: input.orderAmount,
    codAmount: input.codAmount,
    weightKg: input.weightKg,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    pickup,
    customer: input.customer,
    items: input.items,
  });

  if (ekartConfig.debugLogs) {
    console.info(
      `[ekart] create payload sanitized=${JSON.stringify(sanitizeForProviderLog(built.body))}`
    );
  }

  let raw: unknown;
  try {
    raw = await ekartPost<unknown>(ekartConfig.createEndpoint, built.body, {
      retryable: false,
      correlationId:
        typeof input.providerPayload?.correlationId === "string"
          ? input.providerPayload.correlationId
          : undefined,
    });
  } catch (err) {
    recordEkartBookingFailure(Date.now() - started);
    throw err;
  }

  const parsed = parseEkartCreateResponse(raw);
  if (parsed.rejected || !parsed.trackingId) {
    recordEkartBookingFailure(Date.now() - started);
    throw new AppError(
      422,
      parsed.message ||
        `Ekart rejected shipment create (status=${parsed.status || "unknown"})`
    );
  }

  recordEkartBookingSuccess(Date.now() - started);

  // awb = response tracking_id only. Merchant ref stays in raw metadata — never overwrite.
  return {
    providerOrderId: parsed.requestId || built.clientReferenceId,
    providerShipmentId: parsed.trackingId,
    awb: parsed.trackingId,
    courierId: input.courierId || "ekart",
    courierName: "Ekart",
    status: parsed.status,
    message: parsed.message,
    raw: {
      ...(sanitizeForProviderLog(raw) as Record<string, unknown>),
      shipamaze: {
        clientReferenceId: built.clientReferenceId,
        trackingIdSent: built.trackingIdSent,
        trackingIdFromResponse: parsed.trackingId,
        requestId: parsed.requestId,
      },
    },
  };
}

export async function trackEkartShipmentByAwb(
  input: ProviderTrackInput
): Promise<ProviderTrackingResult> {
  return trackEkartShipment(input);
}

export async function getEkartShipment(
  input: ProviderGetShipmentInput
): Promise<ProviderShipmentResult> {
  const awb = String(input.awb ?? input.providerOrderId ?? "").trim();
  if (!awb) throw new AppError(400, "Ekart getShipment requires AWB / tracking id");
  const tracked = await trackEkartShipment({ awb });
  return {
    providerOrderId: tracked.providerOrderId || awb,
    providerShipmentId: awb,
    awb: tracked.awb,
    courierName: tracked.courierName || "Ekart",
    status: tracked.status,
    message: tracked.message,
    raw: tracked.raw as Record<string, unknown> | undefined,
  };
}

export async function cancelEkartShipment(
  _input: ProviderCancelInput
): Promise<ProviderCancelResult> {
  throw new AppError(
    501,
    "Ekart cancel is not enabled in Phase 1 (use RTO API in a later phase)."
  );
}
