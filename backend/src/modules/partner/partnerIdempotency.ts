import { createHash } from "crypto";
import type { Types } from "mongoose";
import {
  PartnerIdempotencyRecord,
  type PartnerIdempotencyStatus,
  type IPartnerIdempotencyRecord,
} from "../../models/PartnerIdempotencyRecord.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { Order, type IOrder } from "../../models/Order.js";
import {
  isPartnerOrderBookingUncertain,
  isPartnerOrderSuccessfullyBooked,
} from "./partnerReferenceLifecycle.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** Stale PENDING records older than this may be superseded by recovery. */
export const STALE_PENDING_MS = 10 * 60 * 1000;

/** Canonical JSON — stable key order; arrays preserve element order. */
export function stableCanonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableCanonicalJson(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(obj[key])}`);
  return `{${parts.join(",")}}`;
}

export function fingerprintPartnerRequest(body: unknown): string {
  const normalized = stableCanonicalJson(body ?? {});
  return createHash("sha256").update(normalized).digest("hex");
}

export type IdempotencyCheckResult =
  | { action: "proceed" }
  | { action: "proceed_after_reset" }
  | { action: "replay"; httpStatus: number; body: Record<string, unknown> }
  | { action: "conflict" }
  | { action: "in_progress" }
  | { action: "resume_order"; order: IOrder };

async function findOrderForIdempotencyRecord(
  partnerId: Types.ObjectId,
  record: IPartnerIdempotencyRecord
): Promise<IOrder | null> {
  if (record.orderId) {
    const byOrderId = await Order.findOne({
      orderId: record.orderId,
      partnerId,
    });
    if (byOrderId) return byOrderId;
  }
  const ref = String(record.partnerReferenceId ?? "").trim();
  if (ref) {
    return Order.findOne({ partnerId, partnerReferenceId: ref });
  }
  return null;
}

export async function resetPartnerIdempotencyForRetry(opts: {
  partnerId: Types.ObjectId;
  idempotencyKey: string;
}): Promise<void> {
  await PartnerIdempotencyRecord.deleteOne({
    partnerId: opts.partnerId,
    idempotencyKey: opts.idempotencyKey,
  }).catch(() => undefined);
}

export async function checkPartnerIdempotency(opts: {
  partnerId: Types.ObjectId;
  idempotencyKey: string;
  requestFingerprint: string;
  partnerReferenceId?: string;
}): Promise<IdempotencyCheckResult> {
  const existing = await PartnerIdempotencyRecord.findOne({
    partnerId: opts.partnerId,
    idempotencyKey: opts.idempotencyKey,
  });

  if (!existing) {
    return { action: "proceed" };
  }

  if (existing.requestFingerprint !== opts.requestFingerprint) {
    return { action: "conflict" };
  }

  if (existing.status === "PENDING") {
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs > STALE_PENDING_MS) {
      await PartnerIdempotencyRecord.deleteOne({ _id: existing._id }).catch(() => undefined);
      return { action: "proceed" };
    }
    const order = await findOrderForIdempotencyRecord(opts.partnerId, existing);
    if (order) {
      return { action: "resume_order", order };
    }
    return { action: "in_progress" };
  }

  if (existing.status === "COMPLETED") {
    if (existing.responseBody && existing.httpStatus) {
      return {
        action: "replay",
        httpStatus: existing.httpStatus,
        body: existing.responseBody as Record<string, unknown>,
      };
    }
    const order = await findOrderForIdempotencyRecord(opts.partnerId, existing);
    if (order && isPartnerOrderSuccessfullyBooked(order)) {
      return { action: "resume_order", order };
    }
    return { action: "in_progress" };
  }

  if (existing.status === "FAILED") {
    const ref = String(opts.partnerReferenceId ?? existing.partnerReferenceId ?? "").trim();
    const order =
      ref
        ? await Order.findOne({
            partnerId: opts.partnerId,
            partnerReferenceId: ref,
          })
        : await findOrderForIdempotencyRecord(opts.partnerId, existing);

    if (!order) {
      return { action: "proceed_after_reset" };
    }
    if (isPartnerOrderSuccessfullyBooked(order)) {
      return { action: "resume_order", order };
    }
    if (isPartnerOrderBookingUncertain(order)) {
      return { action: "resume_order", order };
    }
    return { action: "resume_order", order };
  }

  if (existing.status === "UNCERTAIN") {
    const order = await findOrderForIdempotencyRecord(opts.partnerId, existing);
    if (order) {
      if (isPartnerOrderSuccessfullyBooked(order)) {
        return { action: "resume_order", order };
      }
      return { action: "resume_order", order };
    }
    if (existing.responseBody && existing.httpStatus) {
      return {
        action: "replay",
        httpStatus: existing.httpStatus,
        body: existing.responseBody as Record<string, unknown>,
      };
    }
    return { action: "in_progress" };
  }

  return { action: "in_progress" };
}

/**
 * Create a PENDING idempotency record, or reuse/update an existing record for the
 * same partner + key + fingerprint (resume/recovery paths).
 */
export async function ensurePartnerIdempotencyPending(opts: {
  partnerId: Types.ObjectId;
  idempotencyKey: string;
  requestFingerprint: string;
  partnerReferenceId?: string;
  orderId?: string;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
  const pendingSet: Record<string, unknown> = {
    status: "PENDING",
    expiresAt,
  };
  if (opts.partnerReferenceId !== undefined) {
    pendingSet.partnerReferenceId = opts.partnerReferenceId;
  }
  if (opts.orderId !== undefined) {
    pendingSet.orderId = opts.orderId;
  }

  const reused = await PartnerIdempotencyRecord.findOneAndUpdate(
    {
      partnerId: opts.partnerId,
      idempotencyKey: opts.idempotencyKey,
      requestFingerprint: opts.requestFingerprint,
    },
    {
      $set: pendingSet,
      $unset: { httpStatus: "", responseBody: "" },
    },
    { new: true }
  );

  if (reused) return;

  const conflicting = await PartnerIdempotencyRecord.findOne({
    partnerId: opts.partnerId,
    idempotencyKey: opts.idempotencyKey,
  }).select("requestFingerprint");

  if (conflicting) {
    throw new AppError(
      409,
      "Idempotency-Key was already used with a different request body"
    );
  }

  try {
    await PartnerIdempotencyRecord.create({
      partnerId: opts.partnerId,
      idempotencyKey: opts.idempotencyKey,
      requestFingerprint: opts.requestFingerprint,
      status: "PENDING",
      partnerReferenceId: opts.partnerReferenceId,
      orderId: opts.orderId,
      expiresAt,
    });
  } catch (err) {
    const dup = err as { code?: number };
    if (dup.code === 11000) {
      const raced = await PartnerIdempotencyRecord.findOneAndUpdate(
        {
          partnerId: opts.partnerId,
          idempotencyKey: opts.idempotencyKey,
          requestFingerprint: opts.requestFingerprint,
        },
        {
          $set: pendingSet,
          $unset: { httpStatus: "", responseBody: "" },
        },
        { new: true }
      );
      if (raced) return;
      throw new AppError(409, "Idempotency key conflict — request already in progress");
    }
    throw err;
  }
}

export async function completePartnerIdempotency(opts: {
  partnerId: Types.ObjectId;
  idempotencyKey: string;
  status: PartnerIdempotencyStatus;
  httpStatus: number;
  responseBody: Record<string, unknown>;
  orderId?: string;
  partnerReferenceId?: string;
}): Promise<void> {
  await PartnerIdempotencyRecord.updateOne(
    { partnerId: opts.partnerId, idempotencyKey: opts.idempotencyKey },
    {
      $set: {
        status: opts.status,
        httpStatus: opts.httpStatus,
        responseBody: opts.responseBody,
        orderId: opts.orderId,
        partnerReferenceId: opts.partnerReferenceId,
      },
    }
  ).catch(() => undefined);
}
