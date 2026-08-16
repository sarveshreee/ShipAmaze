/**
 * Partner shipment create orchestration — idempotency recovery, order resume,
 * and lost-response reconstruction (C-01 / C-02).
 */

import type { Types } from "mongoose";
import mongoose from "mongoose";
import { AppError } from "../../middleware/errorMiddleware.js";
import { Order, type IOrder } from "../../models/Order.js";
import type { IPartner } from "../../models/Partner.js";
import type { IPickup } from "../../models/Pickup.js";
import type { PartnerCreateShipmentInput } from "./dto/schemas.js";
import {
  mapOrderToPartnerShipmentDto,
  partnerErrorResponse,
  partnerSuccessResponse,
} from "./dto/responses.js";
import {
  checkPartnerIdempotency,
  completePartnerIdempotency,
  ensurePartnerIdempotencyPending,
  fingerprintPartnerRequest,
  resetPartnerIdempotencyForRetry,
  type IdempotencyCheckResult,
} from "./partnerIdempotency.js";
import {
  createPartnerOrder,
  findPartnerOrderByReference,
  assertPartnerOrderAccess,
} from "./partnerOrderService.js";
import { bookPartnerShipment } from "./partnerBookingService.js";
import {
  isPartnerOrderBookingUncertain,
  isPartnerOrderSuccessfullyBooked,
  releasePartnerReferenceAfterFailedBooking,
} from "./partnerReferenceLifecycle.js";
import {
  assertPartnerPickupAccess,
  assertPartnerProviderAllowed,
  assertPartnerLorrigoPickupSynced,
} from "./partnerPickupService.js";
import type { BookShipmentResult } from "../courier/bookShipment.js";

export type PartnerShipmentCreateResult =
  | { kind: "success"; httpStatus: number; body: Record<string, unknown> }
  | { kind: "error"; httpStatus: number; body: Record<string, unknown>; throwErr?: AppError };

export type PartnerShipmentCreateContext = {
  partner: IPartner;
  apiKeyId: string;
  parsed: PartnerCreateShipmentInput;
  idempotencyKey: string;
  requestId: string;
  correlationId: string;
};

function applyBookingToDto(
  dto: ReturnType<typeof mapOrderToPartnerShipmentDto>,
  booking?: BookShipmentResult
): ReturnType<typeof mapOrderToPartnerShipmentDto> {
  if (!booking) return dto;
  dto.awb = booking.awb || dto.awb;
  dto.status = String(booking.status ?? dto.status).toUpperCase();
  if (booking.labelUrl) dto.labelUrl = booking.labelUrl;
  if (booking.freightCharge != null) dto.shippingCharges = booking.freightCharge;
  return dto;
}

export function buildShipmentSuccessBody(
  order: IOrder,
  requestId: string,
  correlationId: string,
  booking?: BookShipmentResult
): Record<string, unknown> {
  const dto = applyBookingToDto(mapOrderToPartnerShipmentDto(order), booking);
  return partnerSuccessResponse(dto, requestId, correlationId);
}

export function classifyPartnerOrderForCreate(order: IOrder): "booked" | "uncertain" | "pending" {
  if (isPartnerOrderSuccessfullyBooked(order)) return "booked";
  if (isPartnerOrderBookingUncertain(order)) return "uncertain";
  return "pending";
}

async function refreshOrder(orderId: string): Promise<IOrder | null> {
  return Order.findOne({ orderId });
}

/** Mongo unique-index collision or TOCTOU reference conflict during Order create. */
function isPartnerOrderCreateRace(err: unknown): boolean {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  ) {
    return true;
  }
  return (
    err instanceof AppError &&
    err.statusCode === 409 &&
    /referenceId .+ already exists/i.test(err.message)
  );
}

/** Concurrent worker holds booking claim — must not release partner reference. */
function isConcurrentBookingInProgress(err: unknown): boolean {
  return (
    err instanceof AppError &&
    err.statusCode === 409 &&
    /Booking already in progress/i.test(err.message)
  );
}

function inProgressResponse(
  ctx: PartnerShipmentCreateContext
): PartnerShipmentCreateResult {
  const body = partnerErrorResponse(
    "IDEMPOTENCY_IN_PROGRESS",
    "A request with this Idempotency-Key is already in progress",
    true,
    ctx.requestId,
    ctx.correlationId
  );
  return { kind: "error", httpStatus: 409, body };
}

async function ensureIdempotencyPending(opts: {
  partnerId: Types.ObjectId;
  idempotencyKey: string;
  requestFingerprint: string;
  partnerReferenceId: string;
  orderId?: string;
}): Promise<void> {
  await ensurePartnerIdempotencyPending(opts);
}

async function finalizeSuccess(opts: {
  partnerId: Types.ObjectId;
  idempotencyKey: string;
  order: IOrder;
  parsed: PartnerCreateShipmentInput;
  requestId: string;
  correlationId: string;
  booking?: BookShipmentResult;
}): Promise<PartnerShipmentCreateResult> {
  const body = buildShipmentSuccessBody(
    opts.order,
    opts.requestId,
    opts.correlationId,
    opts.booking
  );
  await completePartnerIdempotency({
    partnerId: opts.partnerId,
    idempotencyKey: opts.idempotencyKey,
    status: "COMPLETED",
    httpStatus: 201,
    responseBody: body,
    orderId: opts.order.orderId,
    partnerReferenceId: opts.parsed.referenceId,
  });
  return { kind: "success", httpStatus: 201, body };
}

async function finalizeBookingError(opts: {
  partnerId: Types.ObjectId;
  idempotencyKey: string;
  order: IOrder;
  parsed: PartnerCreateShipmentInput;
  requestId: string;
  correlationId: string;
  bookErr: unknown;
}): Promise<PartnerShipmentCreateResult> {
  const anyErr = opts.bookErr as AppError & {
    code?: string;
    provider?: string;
    retryable?: boolean;
  };

  let bookingStatus: "FAILED" | "UNCERTAIN" = "FAILED";
  let httpStatus = anyErr.statusCode ?? 500;

  if (anyErr.code === "BOOKING_UNCERTAIN") {
    bookingStatus = "UNCERTAIN";
    httpStatus = 504;
  }

  const errBody = partnerErrorResponse(
    anyErr.code ?? "BOOKING_FAILED",
    anyErr.message ?? "Shipment could not be booked",
    Boolean(anyErr.retryable),
    opts.requestId,
    opts.correlationId,
    anyErr.provider ? { provider: anyErr.provider } : undefined
  );

  if (bookingStatus === "FAILED") {
    await releasePartnerReferenceAfterFailedBooking(
      opts.order,
      "Partner shipment booking failed — reference released for retry"
    );
  }

  await completePartnerIdempotency({
    partnerId: opts.partnerId,
    idempotencyKey: opts.idempotencyKey,
    status: bookingStatus,
    httpStatus,
    responseBody: errBody,
    orderId: opts.order.orderId,
    partnerReferenceId: opts.parsed.referenceId,
  });

  return {
    kind: "error",
    httpStatus,
    body: errBody,
    throwErr: anyErr instanceof AppError ? anyErr : undefined,
  };
}

async function resumeBookingOnOrder(
  ctx: PartnerShipmentCreateContext,
  order: IOrder,
  partnerId: Types.ObjectId
): Promise<PartnerShipmentCreateResult> {
  const fingerprint = fingerprintPartnerRequest(ctx.parsed);

  await ensureIdempotencyPending({
    partnerId,
    idempotencyKey: ctx.idempotencyKey,
    requestFingerprint: fingerprint,
    partnerReferenceId: ctx.parsed.referenceId,
    orderId: order.orderId,
  });

  try {
    const booking = await bookPartnerShipment({
      partner: ctx.partner,
      order,
      input: ctx.parsed,
      idempotencyKey: ctx.idempotencyKey,
    });

    const refreshed = await refreshOrder(order.orderId);
    const finalOrder = refreshed ?? order;

    return await finalizeSuccess({
      partnerId,
      idempotencyKey: ctx.idempotencyKey,
      order: finalOrder,
      parsed: ctx.parsed,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      booking,
    });
  } catch (bookErr) {
    const refreshed = await refreshOrder(order.orderId);
    const target = refreshed ?? order;

    if (isPartnerOrderSuccessfullyBooked(target)) {
      return await finalizeSuccess({
        partnerId,
        idempotencyKey: ctx.idempotencyKey,
        order: target,
        parsed: ctx.parsed,
        requestId: ctx.requestId,
        correlationId: ctx.correlationId,
      });
    }

    if (isConcurrentBookingInProgress(bookErr)) {
      return inProgressResponse(ctx);
    }

    return await finalizeBookingError({
      partnerId,
      idempotencyKey: ctx.idempotencyKey,
      order: target,
      parsed: ctx.parsed,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      bookErr,
    });
  }
}

async function resolveExistingOrder(
  ctx: PartnerShipmentCreateContext,
  existingOrder: IOrder,
  partnerId: Types.ObjectId
): Promise<PartnerShipmentCreateResult | null> {
  assertPartnerOrderAccess(existingOrder, String(partnerId));

  const state = classifyPartnerOrderForCreate(existingOrder);

  if (state === "booked") {
    return await finalizeSuccess({
      partnerId,
      idempotencyKey: ctx.idempotencyKey,
      order: existingOrder,
      parsed: ctx.parsed,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
    });
  }

  if (state === "uncertain" || state === "pending") {
    return await resumeBookingOnOrder(ctx, existingOrder, partnerId);
  }

  return null;
}

async function resolveOrderFromIdempotencyRecord(
  ctx: PartnerShipmentCreateContext,
  idemCheck: IdempotencyCheckResult,
  partnerId: Types.ObjectId
): Promise<PartnerShipmentCreateResult | null> {
  if (idemCheck.action !== "resume_order" || !idemCheck.order) return null;
  assertPartnerOrderAccess(idemCheck.order, String(partnerId));
  return await resolveExistingOrder(ctx, idemCheck.order, partnerId);
}

async function createNewPartnerShipment(
  ctx: PartnerShipmentCreateContext,
  partnerId: Types.ObjectId,
  pickup: IPickup
): Promise<PartnerShipmentCreateResult> {
  const fingerprint = fingerprintPartnerRequest(ctx.parsed);

  await ensureIdempotencyPending({
    partnerId,
    idempotencyKey: ctx.idempotencyKey,
    requestFingerprint: fingerprint,
    partnerReferenceId: ctx.parsed.referenceId,
  });

  let order: IOrder;
  try {
    order = await createPartnerOrder({
      partner: ctx.partner,
      apiKeyId: new mongoose.Types.ObjectId(ctx.apiKeyId),
      input: ctx.parsed,
      pickup,
    });
  } catch (createErr) {
    if (isPartnerOrderCreateRace(createErr)) {
      const existing = await findPartnerOrderByReference(partnerId, ctx.parsed.referenceId);
      if (existing) {
        const resolved = await resolveExistingOrder(ctx, existing, partnerId);
        if (resolved) return resolved;
      }
    }
    throw createErr;
  }

  try {
    const booking = await bookPartnerShipment({
      partner: ctx.partner,
      order,
      input: ctx.parsed,
      idempotencyKey: ctx.idempotencyKey,
    });

    const refreshed = await refreshOrder(order.orderId);
    const finalOrder = refreshed ?? order;

    return await finalizeSuccess({
      partnerId,
      idempotencyKey: ctx.idempotencyKey,
      order: finalOrder,
      parsed: ctx.parsed,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      booking,
    });
  } catch (bookErr) {
    const refreshed = await refreshOrder(order.orderId);
    const target = refreshed ?? order;

    if (isPartnerOrderSuccessfullyBooked(target)) {
      return await finalizeSuccess({
        partnerId,
        idempotencyKey: ctx.idempotencyKey,
        order: target,
        parsed: ctx.parsed,
        requestId: ctx.requestId,
        correlationId: ctx.correlationId,
      });
    }

    if (isConcurrentBookingInProgress(bookErr)) {
      return inProgressResponse(ctx);
    }

    return await finalizeBookingError({
      partnerId,
      idempotencyKey: ctx.idempotencyKey,
      order: target,
      parsed: ctx.parsed,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      bookErr,
    });
  }
}

/**
 * Main entry — handles idempotency, order recovery, resume booking, and new creates.
 */
export async function processPartnerShipmentCreate(
  ctx: PartnerShipmentCreateContext
): Promise<PartnerShipmentCreateResult> {
  const partnerId = ctx.partner._id as Types.ObjectId;
  const fingerprint = fingerprintPartnerRequest(ctx.parsed);

  const idemCheck = await checkPartnerIdempotency({
    partnerId,
    idempotencyKey: ctx.idempotencyKey,
    requestFingerprint: fingerprint,
    partnerReferenceId: ctx.parsed.referenceId,
  });

  if (idemCheck.action === "replay") {
    return { kind: "success", httpStatus: idemCheck.httpStatus, body: idemCheck.body };
  }
  if (idemCheck.action === "conflict") {
    const body = partnerErrorResponse(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency-Key was already used with a different request body",
      false,
      ctx.requestId,
      ctx.correlationId
    );
    return { kind: "error", httpStatus: 409, body };
  }
  if (idemCheck.action === "in_progress") {
    const body = partnerErrorResponse(
      "IDEMPOTENCY_IN_PROGRESS",
      "A request with this Idempotency-Key is already in progress",
      true,
      ctx.requestId,
      ctx.correlationId
    );
    return { kind: "error", httpStatus: 409, body };
  }

  const fromIdem = await resolveOrderFromIdempotencyRecord(ctx, idemCheck, partnerId);
  if (fromIdem) return fromIdem;

  const existingOrder = await findPartnerOrderByReference(partnerId, ctx.parsed.referenceId);
  if (existingOrder) {
    const resolved = await resolveExistingOrder(ctx, existingOrder, partnerId);
    if (resolved) return resolved;
  }

  if (idemCheck.action === "proceed_after_reset") {
    await resetPartnerIdempotencyForRetry({
      partnerId,
      idempotencyKey: ctx.idempotencyKey,
    });
  }

  assertPartnerProviderAllowed(ctx.partner, ctx.parsed.provider);
  const pickup = await assertPartnerPickupAccess(ctx.partner, ctx.parsed.pickupAddressId);
  await assertPartnerLorrigoPickupSynced(ctx.parsed.provider, pickup);

  return await createNewPartnerShipment(ctx, partnerId, pickup);
}
