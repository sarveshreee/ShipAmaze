/**
 * Atomic order booking claim — only one worker may book an order at a time.
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import { Order, type IOrder } from "../../models/Order.js";
import { recordDuplicateBookingAttempt } from "../lorrigo/lorrigo.bookingMetrics.js";

const STALE_CLAIM_MS = 5 * 60 * 1000;

export type BookingClaimResult = {
  order: IOrder;
  idempotencyKey: string;
  reusedExisting: boolean;
};

function buildIdempotencyKey(orderId: string, provider: string, explicit?: string): string {
  const key = String(explicit ?? "").trim();
  if (key) return key.slice(0, 128);
  return `${provider}:${orderId}`;
}

/**
 * Atomically claim an order for booking. Returns existing shipment if already booked
 * with the same idempotency key (or any completed booking).
 */
export async function claimOrderForBooking(opts: {
  orderId: string;
  provider: "velocity" | "lorrigo" | "ekart";
  idempotencyKey?: string;
  correlationId?: string;
}): Promise<BookingClaimResult> {
  const idempotencyKey = buildIdempotencyKey(opts.orderId, opts.provider, opts.idempotencyKey);
  const now = new Date();
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);

  // Fast path: already booked
  const existing = await Order.findOne({ orderId: opts.orderId });
  if (!existing) throw new AppError(404, "Order not found");

  if (existing.shipmentCreated || String(existing.awb || "").trim()) {
    recordDuplicateBookingAttempt();
    // Idempotent replay: same key or any completed booking → return existing
    if (
      !existing.bookingIdempotencyKey ||
      existing.bookingIdempotencyKey === idempotencyKey
    ) {
      return { order: existing, idempotencyKey, reusedExisting: true };
    }
    throw new AppError(409, "Order already has a shipment (duplicate booking blocked)");
  }

  const claimed = await Order.findOneAndUpdate(
    {
      orderId: opts.orderId,
      shipmentCreated: { $ne: true },
      $and: [
        {
          $or: [{ awb: { $exists: false } }, { awb: null }, { awb: "" }],
        },
        {
          $or: [
            { bookingInProgress: { $ne: true } },
            { bookingInProgressAt: { $lt: staleBefore } },
            { bookingInProgressAt: { $exists: false } },
            { bookingInProgressAt: null },
          ],
        },
      ],
    },
    {
      $set: {
        bookingInProgress: true,
        bookingInProgressAt: now,
        bookingIdempotencyKey: idempotencyKey,
        ...(opts.correlationId ? { correlationId: opts.correlationId } : {}),
      },
    },
    { new: true }
  );

  if (!claimed) {
    // Another worker holds the claim
    const again = await Order.findOne({ orderId: opts.orderId });
    if (again && (again.shipmentCreated || String(again.awb || "").trim())) {
      recordDuplicateBookingAttempt();
      return { order: again, idempotencyKey, reusedExisting: true };
    }
    recordDuplicateBookingAttempt();
    throw new AppError(409, "Booking already in progress for this order");
  }

  return { order: claimed, idempotencyKey, reusedExisting: false };
}

export async function releaseBookingClaim(orderId: string): Promise<void> {
  await Order.updateOne(
    { orderId, shipmentCreated: { $ne: true } },
    { $set: { bookingInProgress: false }, $unset: { bookingInProgressAt: 1 } }
  ).catch(() => undefined);
}

export async function completeBookingClaim(orderId: string): Promise<void> {
  await Order.updateOne(
    { orderId },
    { $set: { bookingInProgress: false, shipmentCreated: true } }
  ).catch(() => undefined);
}
