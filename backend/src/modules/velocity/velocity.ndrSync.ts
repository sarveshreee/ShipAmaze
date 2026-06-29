/**
 * Velocity Shipping – NDR (Non-Delivery Report) sync.
 *
 * Pulls NDR-raised shipments from Velocity `/custom/api/v1/shipments`
 * and upserts them into the local NDR collection so the NDR Management UI
 * stays in sync with the Velocity panel.
 */

import type { HydratedDocument } from "mongoose";
import { NDR, type INDR } from "../../models/NDR.js";
import { Order, type IOrder } from "../../models/Order.js";
import { Vendor } from "../../models/Vendor.js";
import { listShipments } from "./velocity.service.js";
import { mapVelocityStatus } from "./velocity.mapper.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import { devLog } from "../../utils/devLog.js";
import type { VelocityShipmentsRequest } from "./velocity.types.js";

const NDR_VELOCITY_STATUSES = ["ndr_raised", "need_attention", "reattempt_delivery"] as const;

const TERMINAL_ORDER_STATUSES = new Set(["delivered", "cancelled", "rto", "reship"]);

export interface NdrSyncResult {
  fetched: number;
  upserted: number;
  ordersUpdated: number;
  closed: number;
  errors: number;
  errorDetails?: string[];
}

function extractShipmentAttributes(row: unknown): Record<string, unknown> {
  const obj = row != null && typeof row === "object" ? (row as Record<string, unknown>) : {};
  return obj.attributes != null && typeof obj.attributes === "object"
    ? (obj.attributes as Record<string, unknown>)
    : obj;
}

function formatNdrReason(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "NDR";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLastUpdate(dateStr: unknown): string {
  if (!dateStr) {
    return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
  }
  const d = new Date(String(dateStr));
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function getNdrRaisedAt(attrs: Record<string, unknown>): string | undefined {
  const milestones = Array.isArray(attrs.shipment_milestones)
    ? (attrs.shipment_milestones as Record<string, unknown>[])
    : [];
  const ndrMilestone = milestones.find((m) => String(m.milestone ?? "") === "ndr_raised");
  if (ndrMilestone?.milestone_at) return String(ndrMilestone.milestone_at);

  const tracking = Array.isArray(attrs.tracking_details) ? attrs.tracking_details : [];
  for (const t of tracking) {
    if (t && typeof t === "object") {
      const tr = t as Record<string, unknown>;
      const st = String(tr.status ?? "").toLowerCase();
      if (st.includes("ndr") || st.includes("undelivered")) {
        const dt = tr.event_date_time;
        if (dt) return String(dt);
      }
    }
  }
  if (attrs.updated_at) return String(attrs.updated_at);
  return undefined;
}

function listMetaTotal(raw: Record<string, unknown>): number {
  const meta = raw.meta != null && typeof raw.meta === "object" ? (raw.meta as Record<string, unknown>) : {};
  const total = meta.total ?? raw.total;
  return typeof total === "number" ? total : Number(total) || 0;
}

async function resolveSellerName(
  order: HydratedDocument<IOrder> | null,
  attrs: Record<string, unknown>
): Promise<string> {
  const ordAttrs = attrs.order as Record<string, unknown> | undefined;
  if (order?.vendorId) {
    const vendor = await Vendor.findById(order.vendorId).select("name").lean();
    if (vendor?.name) return String(vendor.name);
  }
  return String(ordAttrs?.store_name ?? order?.channel ?? "").trim();
}

function isNdrVelocityStatus(velocityStatus: string): boolean {
  return normalizeOrderStatus(mapVelocityStatus(velocityStatus)) === "ndr";
}

/**
 * Upsert a single NDR record from a Velocity shipment list row or tracking result.
 */
export async function upsertNdrFromVelocityShipment(
  row: unknown,
  localOrder?: HydratedDocument<IOrder> | null
): Promise<{ upserted: boolean; orderUpdated: boolean; closed: boolean }> {
  const attrs = extractShipmentAttributes(row);
  const awb = String(attrs.tracking_number ?? attrs.awb ?? attrs.awb_code ?? "").trim();
  if (!awb) return { upserted: false, orderUpdated: false, closed: false };

  const velocityStatus = String(attrs.status ?? "ndr_raised");
  const rowId = row != null && typeof row === "object" ? (row as Record<string, unknown>).id : "";
  const shipmentId = String(attrs.id ?? rowId ?? "").trim();

  if (!isNdrVelocityStatus(velocityStatus)) {
    const existing = await NDR.findOne({ awb });
    if (existing && existing.status === "Active") {
      await NDR.findOneAndUpdate(
        { awb },
        { $set: { status: "Closed", lastUpdate: formatLastUpdate(new Date()) } }
      );
      return { upserted: false, orderUpdated: false, closed: true };
    }
    return { upserted: false, orderUpdated: false, closed: false };
  }

  const shippingAddr = attrs.shipping_address as Record<string, unknown> | undefined;
  const customer = String(shippingAddr?.name ?? "").trim();
  const phone = String(shippingAddr?.phone ?? "").trim();
  const reason = formatNdrReason(
    attrs.ndr_reason ?? attrs.needs_attention_issue ?? attrs.sub_status ?? "NDR"
  );
  const attempts = Math.max(1, Number(attrs.attempt_count ?? attrs.attempts_count ?? 1) || 1);
  const lastUpdate = formatLastUpdate(getNdrRaisedAt(attrs) ?? attrs.updated_at ?? attrs.created_at);
  const carrierObj = attrs.carrier as Record<string, unknown> | undefined;
  const carrier = String(carrierObj?.name ?? "").trim();
  const ordAttrs = attrs.order as Record<string, unknown> | undefined;
  const amount = Number(attrs.total_price ?? attrs.cod_amount ?? ordAttrs?.total_price ?? 0) || undefined;

  let order = localOrder ?? null;
  if (!order) {
    const orClauses: Record<string, unknown>[] = [{ awb }, { trackingId: awb }];
    if (shipmentId) orClauses.push({ velocityShipmentId: shipmentId });
    order = await Order.findOne({ $or: orClauses });
  }

  const seller = await resolveSellerName(order, attrs);
  const existingNdr = await NDR.findOne({ awb }).lean();
  const preserveStatus =
    existingNdr?.status === "Initiated" || existingNdr?.status === "Closed"
      ? existingNdr.status
      : "Active";

  const ndrSet: Partial<INDR> = {
    customer: customer || (order?.customer ?? ""),
    seller,
    reason,
    attempts,
    lastUpdate,
    phone: phone || (order?.phone ?? ""),
    status: preserveStatus,
    nextAction: existingNdr?.nextAction ?? "Re-attempt",
    orderId: order?.orderId ?? String(ordAttrs?.display_id ?? ordAttrs?.external_id ?? ""),
    carrier,
    velocityStatus,
    amount,
  };

  await NDR.findOneAndUpdate({ awb }, { $set: ndrSet }, { upsert: true, new: true });

  let orderUpdated = false;
  if (order) {
    let changed = false;
    if (order.shipmentStatus !== velocityStatus) {
      order.shipmentStatus = velocityStatus;
      changed = true;
    }
    if (order.status !== "ndr") {
      order.status = "ndr";
      changed = true;
    }
    if (changed) {
      await order.save();
      orderUpdated = true;
    }
  }

  return { upserted: true, orderUpdated, closed: false };
}

async function syncNdrFromLocalOrders(result: NdrSyncResult): Promise<void> {
  const ndrOrders = await Order.find({
    awb: { $exists: true, $nin: ["", null] },
    isJunk: { $ne: true },
    $or: [
      { status: "ndr" },
      { shipmentStatus: { $in: [...NDR_VELOCITY_STATUSES, "NDR raised", "ndr_raised"] } },
    ],
  })
    .select("orderId awb trackingId customer phone status shipmentStatus vendorId channel amount")
    .limit(200)
    .lean();

  for (const lean of ndrOrders) {
    const awb = String(lean.awb ?? "").trim();
    if (!awb) continue;

    const existing = await NDR.findOne({ awb }).lean();
    if (existing) continue;

    await NDR.findOneAndUpdate(
      { awb },
      {
        $set: {
          customer: String(lean.customer ?? ""),
          seller: String(lean.channel ?? ""),
          reason: "NDR",
          attempts: 1,
          lastUpdate: formatLastUpdate(new Date()),
          phone: String(lean.phone ?? ""),
          status: "Active",
          nextAction: "Re-attempt",
          orderId: String(lean.orderId ?? ""),
          velocityStatus: String(lean.shipmentStatus ?? "ndr_raised"),
          amount: Number(lean.amount ?? 0) || undefined,
        },
      },
      { upsert: true }
    );
    result.upserted++;
  }
}

async function closeResolvedNdrRecords(result: NdrSyncResult): Promise<void> {
  const activeNdrs = await NDR.find({ status: { $in: ["Active", "Initiated"] } })
    .select("awb orderId")
    .lean();

  for (const ndr of activeNdrs) {
    const order = await Order.findOne({
      $or: [{ awb: ndr.awb }, { trackingId: ndr.awb }, { orderId: ndr.orderId }],
    })
      .select("status shipmentStatus")
      .lean();

    if (!order) continue;

    const st = normalizeOrderStatus(String(order.status ?? ""));
    const shipSt = normalizeOrderStatus(mapVelocityStatus(order.shipmentStatus));

    if (TERMINAL_ORDER_STATUSES.has(st) || (shipSt !== "ndr" && TERMINAL_ORDER_STATUSES.has(shipSt))) {
      await NDR.findOneAndUpdate(
        { awb: ndr.awb },
        { $set: { status: "Closed", lastUpdate: formatLastUpdate(new Date()) } }
      );
      result.closed++;
    }
  }
}

/**
 * Fetch all NDR shipments from Velocity and upsert into the local NDR collection.
 */
export async function syncNdrFromVelocity(options?: { daysBack?: number }): Promise<NdrSyncResult> {
  const daysBack = options?.daysBack ?? 120;
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - daysBack * 24 * 60 * 60;

  const result: NdrSyncResult = {
    fetched: 0,
    upserted: 0,
    ordersUpdated: 0,
    closed: 0,
    errors: 0,
    errorDetails: [],
  };

  const seenAwbs = new Set<string>();

  for (const status of NDR_VELOCITY_STATUSES) {
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
      try {
        const payload: VelocityShipmentsRequest = {
          status,
          page,
          per_page: 100,
          start_time: startTime,
          end_time: endTime,
          date_field: "order_date",
          sort_order: "desc",
        };

        const resp = await listShipments(payload);
        const raw = resp as unknown as Record<string, unknown>;
        const rows = Array.isArray(resp.data) ? resp.data : [];
        result.fetched += rows.length;

        for (const row of rows) {
          const attrs = extractShipmentAttributes(row);
          const awb = String(attrs.tracking_number ?? attrs.awb ?? "").trim();
          if (!awb || seenAwbs.has(awb)) continue;
          seenAwbs.add(awb);

          try {
            const r = await upsertNdrFromVelocityShipment(row);
            if (r.upserted) result.upserted++;
            if (r.orderUpdated) result.ordersUpdated++;
            if (r.closed) result.closed++;
          } catch (err: unknown) {
            result.errors++;
            const msg = err instanceof Error ? err.message : String(err);
            if ((result.errorDetails?.length ?? 0) < 5) {
              result.errorDetails = [...(result.errorDetails ?? []), `${awb}: ${msg}`];
            }
          }
        }

        const total = listMetaTotal(raw);
        const perPage = 100;
        hasMore = page * perPage < total && rows.length > 0;
        page++;
      } catch (err: unknown) {
        result.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        devLog.warn(`[velocity:ndr-sync] status=${status} page=${page} failed: ${msg}`);
        if ((result.errorDetails?.length ?? 0) < 5) {
          result.errorDetails = [...(result.errorDetails ?? []), `${status} page ${page}: ${msg}`];
        }
        hasMore = false;
      }
    }
  }

  await syncNdrFromLocalOrders(result);
  await closeResolvedNdrRecords(result);

  devLog.info(
    `[velocity:ndr-sync] done — fetched=${result.fetched} upserted=${result.upserted} ` +
      `ordersUpdated=${result.ordersUpdated} closed=${result.closed} errors=${result.errors}`
  );

  return result;
}
