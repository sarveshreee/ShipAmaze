import mongoose, { type Types } from "mongoose";
import { Order } from "../models/Order.js";
import { CodRemittance } from "../models/CodRemittance.js";
import { User } from "../models/User.js";
import { Vendor } from "../models/Vendor.js";
import { orderCodCollectableAmount } from "./normalizeOrderPayment.js";

const DELIVERED_STATUSES = [
  "delivered",
  "Delivered",
  "DELIVERED",
];

function weekKey(d: Date): string {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  start.setDate(start.getDate() + diff);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const dd = String(start.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

function settleDateFromWeekKey(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(4, 6));
  const d = Number(key.slice(6, 8));
  const start = new Date(y, m - 1, d);
  const settle = new Date(start);
  settle.setDate(settle.getDate() + 7); // settle next Monday
  return settle.toISOString().slice(0, 10);
}

function ownerIdFromOrder(o: {
  ownerUserId?: unknown;
  dropshipperId?: unknown;
  createdBy?: unknown;
  vendorId?: unknown;
}): Types.ObjectId | null {
  for (const raw of [o.ownerUserId, o.dropshipperId, o.createdBy]) {
    if (raw && mongoose.isValidObjectId(String(raw))) {
      return new mongoose.Types.ObjectId(String(raw));
    }
  }
  return null;
}

/**
 * Ensure CodRemittance rows exist for delivered COD orders (lazy sync).
 * Groups by owner + delivery week. Idempotent via remittanceId unique key.
 */
export async function syncCodRemittancesFromOrders(scopeUserId?: Types.ObjectId): Promise<number> {
  const match: Record<string, unknown> = {
    payment: { $in: ["COD", "cod", "Cod"] },
    status: { $in: DELIVERED_STATUSES },
    isJunk: { $ne: true },
  };
  if (scopeUserId) {
    match.$or = [
      { ownerUserId: scopeUserId },
      { createdBy: scopeUserId },
      { dropshipperId: scopeUserId },
    ];
    // Vendors: also match by vendorId
    const vendor = await Vendor.findOne({ userId: scopeUserId }).select("_id").lean();
    if (vendor?._id) {
      (match.$or as unknown[]).push({ vendorId: vendor._id });
    }
  }

  const orders = await Order.find(match)
    .select(
      "orderId amount payment codCollectableAmount amountOutstanding amountPaid shippingCharges codCharges rtoCharges ownerUserId dropshipperId createdBy vendorId updatedAt createdAt statusHistory"
    )
    .lean()
    .limit(20_000);

  if (orders.length === 0) return 0;

  type Bucket = {
    userId: Types.ObjectId;
    week: string;
    ordersCount: number;
    codAmount: number;
    deductions: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const o of orders) {
    const uid = ownerIdFromOrder(o);
    if (!uid) continue;
    const deliveredAt =
      (Array.isArray(o.statusHistory)
        ? [...o.statusHistory]
            .reverse()
            .find((e) => DELIVERED_STATUSES.includes(String((e as { status?: string }).status ?? "")))
        : null) as { at?: Date } | null;
    const timestamps = o as { updatedAt?: Date; createdAt?: Date };
    const when = deliveredAt?.at
      ? new Date(deliveredAt.at)
      : timestamps.updatedAt
        ? new Date(timestamps.updatedAt)
        : timestamps.createdAt
          ? new Date(timestamps.createdAt)
          : new Date();
    const week = weekKey(when);
    const key = `${String(uid)}:${week}`;
    const amount = orderCodCollectableAmount(o as { payment?: string; amount?: number; codCollectableAmount?: number; amountOutstanding?: number });
    const deductions =
      (Number(o.shippingCharges ?? 0) || 0) +
      (Number(o.codCharges ?? 0) || 0) +
      (Number(o.rtoCharges ?? 0) || 0);
    const existing = buckets.get(key);
    if (existing) {
      existing.ordersCount += 1;
      existing.codAmount += amount;
      existing.deductions += deductions;
    } else {
      buckets.set(key, {
        userId: uid,
        week,
        ordersCount: 1,
        codAmount: amount,
        deductions,
      });
    }
  }

  const userIds = [...new Set([...buckets.values()].map((b) => String(b.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name companyName")
    .lean();
  const nameById = new Map(
    users.map((u) => [String(u._id), String(u.companyName || u.name || "Account")])
  );

  let upserted = 0;
  for (const b of buckets.values()) {
    const remittanceId = `COD-${b.week}-${String(b.userId).slice(-8)}`;
    const netPayable = Math.max(0, b.codAmount - b.deductions);
    const settleDate = settleDateFromWeekKey(b.week);
    const now = new Date();
    const settle = new Date(settleDate);
    const status = settle <= now ? "Settled" : "Pending";

    const result = await CodRemittance.updateOne(
      { remittanceId },
      {
        $set: {
          userId: b.userId,
          dropshipper: nameById.get(String(b.userId)) ?? "Account",
          ordersCount: b.ordersCount,
          codAmount: Math.round(b.codAmount * 100) / 100,
          deductions: Math.round(b.deductions * 100) / 100,
          netPayable: Math.round(netPayable * 100) / 100,
          settleDate,
        },
        $setOnInsert: {
          remittanceId,
          status,
          utr: status === "Settled" ? `AUTO-${remittanceId}` : undefined,
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount || result.modifiedCount) upserted += 1;
  }

  return upserted;
}
