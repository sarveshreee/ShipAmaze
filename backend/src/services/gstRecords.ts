import type { Types } from "mongoose";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { Vendor } from "../models/Vendor.js";
import { buildOrderVisibilityQuery } from "../utils/orderFilters.js";
import type { IUser } from "../models/User.js";

export type GstRecordRow = {
  orderId: string;
  date: string;
  customer: string;
  amount: number;
  gstPct: number;
  gstAmount: number;
  taxableValue: number;
  total: number;
  payment: "COD" | "Prepaid";
  status: "Pending" | "Processed" | "Settled";
};

const DEFAULT_GST_PCT = 18;

function lineItems(o: Record<string, unknown>): Array<Record<string, unknown>> {
  for (const key of ["products", "orderItems", "items", "shopifyLineItems"]) {
    const v = o[key];
    if (Array.isArray(v) && v.length > 0) return v as Array<Record<string, unknown>>;
  }
  return [];
}

function firstSku(items: Array<Record<string, unknown>>): string {
  for (const it of items) {
    const sku = String(it.sku ?? it.productCode ?? "").trim();
    if (sku) return sku;
  }
  return "";
}

function gstPctFromItems(
  items: Array<Record<string, unknown>>,
  skuGst: Map<string, number>
): number {
  const pcts: number[] = [];
  for (const it of items) {
    const direct = Number(it.gst_percent ?? it.gstPercent ?? it.gst ?? NaN);
    if (Number.isFinite(direct) && direct >= 0) {
      pcts.push(direct);
      continue;
    }
    const sku = String(it.sku ?? it.productCode ?? "").trim();
    if (sku && skuGst.has(sku)) pcts.push(skuGst.get(sku)!);
  }
  if (pcts.length === 0) return DEFAULT_GST_PCT;
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

function mapPayment(raw: unknown): "COD" | "Prepaid" {
  const s = String(raw ?? "").toLowerCase();
  return s === "cod" ? "COD" : "Prepaid";
}

function mapGstStatus(status: string, shipmentCreated?: boolean): "Pending" | "Processed" | "Settled" {
  const s = status.toLowerCase().replace(/_/g, "-");
  if (s === "delivered") return "Settled";
  if (shipmentCreated || s.includes("transit") || s.includes("pickup") || s.includes("ship")) {
    return "Processed";
  }
  return "Pending";
}

/**
 * Build GST rows from the caller's visible orders (real data, not mocks).
 */
export async function listGstRecordsForUser(
  user: IUser,
  opts?: { search?: string; limit?: number }
): Promise<GstRecordRow[]> {
  const visibility = await buildOrderVisibilityQuery(user);
  const limit = Math.min(5_000, Math.max(1, opts?.limit ?? 500));

  const query: Record<string, unknown> = {
    ...visibility,
    isJunk: { $ne: true },
  };

  const search = opts?.search?.trim();
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$and = [
      ...(Array.isArray((query as { $and?: unknown[] }).$and) ? (query as { $and: unknown[] }).$and : []),
      { $or: [{ orderId: rx }, { customer: rx }] },
    ];
  }

  // Vendors without vendor doc still see createdBy via visibility
  if (user.role === "vendor") {
    const v = await Vendor.findOne({ userId: user._id }).select("_id").lean();
    if (v?._id && !Object.keys(visibility).length) {
      query.vendorId = v._id as Types.ObjectId;
    }
  }

  const orders = await Order.find(query).sort({ createdAt: -1 }).limit(limit).lean();

  const skus = new Set<string>();
  for (const o of orders) {
    const sku = firstSku(lineItems(o as unknown as Record<string, unknown>));
    if (sku) skus.add(sku);
  }

  const skuGst = new Map<string, number>();
  if (skus.size > 0) {
    const products = await Product.find({ sku: { $in: [...skus] } })
      .select("sku gst_percent gstPercent")
      .lean();
    for (const p of products) {
      const pct = Number(
        (p as { gst_percent?: number; gstPercent?: number }).gst_percent ??
          (p as { gstPercent?: number }).gstPercent ??
          NaN
      );
      if (Number.isFinite(pct) && p.sku) skuGst.set(String(p.sku), pct);
    }
  }

  return orders.map((o) => {
    const items = lineItems(o as unknown as Record<string, unknown>);
    const amount = Number(o.amount ?? 0) || 0;
    const gstPct = Math.round(gstPctFromItems(items, skuGst) * 100) / 100;
    const taxableValue = Math.round((amount / (1 + gstPct / 100)) * 100) / 100;
    const gstAmount = Math.round((amount - taxableValue) * 100) / 100;
    const createdAt = (o as { createdAt?: Date }).createdAt;
    const dateRaw = o.date || (createdAt ? new Date(createdAt).toISOString().slice(0, 10) : "");
    return {
      orderId: String(o.orderId),
      date: String(dateRaw),
      customer: String(o.customer ?? ""),
      amount,
      gstPct,
      gstAmount,
      taxableValue,
      total: amount,
      payment: mapPayment(o.payment),
      status: mapGstStatus(String(o.status ?? ""), Boolean(o.shipmentCreated)),
    };
  });
}
