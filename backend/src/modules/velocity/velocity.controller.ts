/**
 * Velocity Shipping – Express controllers.
 * Each handler validates, calls the service, and handles Order model side-effects.
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { pickupByIdManageQuery, PICKUP_NOT_DELETED } from "../../utils/pickupQuery.js";
import { Order, type IOrder } from "../../models/Order.js";
import { Warehouse } from "../../models/Warehouse.js";
import { Vendor } from "../../models/Vendor.js";
import { Pickup } from "../../models/Pickup.js";
import * as velocityService from "./velocity.service.js";
import { mapVelocityStatus, shouldApplyInternalStatusUpdate } from "./velocity.mapper.js";
import { normalizePincode, sanitizeForVelocityLog } from "./velocity.payload.js";
import { devLog } from "../../utils/devLog.js";
import type {
  VelocityCustomer,
  VelocityForwardOrderRequest,
  VelocityReverseOrderRequest,
} from "./velocity.types.js";
import {
  assertWalletBalanceAtLeast,
  debitShipmentChargeIfApplicable,
  orderWalletUserId,
} from "../../services/walletLedger.js";
import { resolvePreferredCourierName } from "../../services/courierPriorityService.js";

async function applyCourierPriorityRules(
  merged: Record<string, unknown>,
  localOrder: IOrder | null
): Promise<void> {
  if (merged.carrier_id != null && String(merged.carrier_id).trim() !== "") return;
  if (!localOrder) return;
  const { courierName, candidates, matchedRules } = await resolvePreferredCourierName(localOrder);
  if (!courierName) return;
  localOrder.courier = courierName;
  localOrder.courierName = courierName;
  devLog.info(
    "[velocity:courier-priority]",
    JSON.stringify({
      orderId: localOrder.orderId,
      courierName,
      matchedRules,
      candidates: candidates.slice(0, 8).map((c) => c.courierName),
    })
  );
}

async function precheckForwardShipmentWallet(localOrder: IOrder | null): Promise<void> {
  if (!localOrder) return;
  const uid = orderWalletUserId(localOrder);
  if (!uid) return;
  const est = Number(localOrder.shippingCharges);
  if (!Number.isFinite(est) || !(est > 0)) return;
  await assertWalletBalanceAtLeast(uid, est);
}

async function forwardShipmentWalletPayload(
  localOrder: IOrder | null,
  shippingCharges: unknown
): Promise<Record<string, unknown>> {
  if (!localOrder) return {};
  const fromResult = Number(shippingCharges);
  const fromOrder = Number(localOrder.shippingCharges);
  const charge =
    Number.isFinite(fromResult) && fromResult > 0
      ? fromResult
      : Number.isFinite(fromOrder) && fromOrder > 0
        ? fromOrder
        : 0;
  const r = await debitShipmentChargeIfApplicable({
    order: localOrder,
    shippingCharges: charge,
  });
  return { walletDeduction: r };
}

function appendStatusHistoryEntry(order: IOrder, status: string, note: string) {
  const prev = order.statusHistory ?? [];
  order.statusHistory = [...prev, { status, at: new Date(), note }].slice(-50);
}

function applyVelocityMappedOrderStatus(
  order: IOrder,
  velocityRawStatus: string | undefined,
  fallback: string,
  note: string
) {
  const mapped = mapVelocityStatus(velocityRawStatus) || fallback;
  if (!shouldApplyInternalStatusUpdate(order.status, mapped)) return;
  if (order.status !== mapped) appendStatusHistoryEntry(order, mapped, note);
  order.status = mapped;
}

function maskPhoneForPublic(phone: string): string {
  const d = String(phone).replace(/\D/g, "");
  if (d.length <= 4) return "****";
  return `******${d.slice(-4)}`;
}

function maskCustomerNameForPublic(name: string): string {
  const s = String(name).trim();
  if (!s) return "Recipient";
  if (s.length <= 2) return `${s[0]}*`;
  return `${s[0]}${"*".repeat(Math.min(4, s.length - 2))}${s.slice(-1)}`;
}

/** Minimal PII for anonymous tracking pages. */
function buildPublicOrderDetails(order: Record<string, unknown>) {
  const customer = String(order.customer ?? "");
  const customerPhone = String(order.customerPhone ?? order.phone ?? "");
  return {
    customerName: maskCustomerNameForPublic(customer),
    phone: maskPhoneForPublic(customerPhone),
    paymentType: String(order.payment ?? ""),
    amount: Number(order.amount ?? 0),
    destination: {
      city: String(order.shippingCity ?? order.city ?? ""),
      state: String(order.shippingState ?? order.state ?? ""),
      pincode: String(order.shippingPincode ?? order.pincode ?? ""),
      address: "",
    },
    dates: {
      orderDate: String(order.date ?? ""),
      assignedAt: order.assignedDateTime ? new Date(String(order.assignedDateTime)).toISOString() : "",
      movedToReadyAt: order.movedToReadyAt ? new Date(String(order.movedToReadyAt)).toISOString() : "",
    },
    shipment: {
      shipmentId: String(order.shipmentId ?? order.velocityShipmentId ?? ""),
      velocityOrderId: String(order.velocityOrderId ?? ""),
      channel: String(order.channel ?? ""),
      weight: String(order.weight ?? ""),
    },
  };
}

type PickupPinMerged = { pickupAddress?: { pincode?: string }; warehouse_id?: string };

async function resolvePickupPincodeForServiceability(merged: PickupPinMerged): Promise<string | null> {
  const fromMerged = String(merged.pickupAddress?.pincode ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (fromMerged.length === 6) return fromMerged;
  const whCode = String(merged.warehouse_id ?? "").trim();
  if (!whCode) return null;
  const wh = await Warehouse.findOne({ velocityWarehouseId: whCode }).select("pincode").lean();
  if (wh?.pincode) {
    const p = String(wh.pincode).replace(/\D/g, "").slice(0, 6);
    if (p.length === 6) return p;
  }
  const pu = await Pickup.findOne({
    velocityWarehouseId: whCode,
    ...PICKUP_NOT_DELETED,
  })
    .select("pincode")
    .lean();
  if (pu?.pincode) {
    const p = String(pu.pincode).replace(/\D/g, "").slice(0, 6);
    if (p.length === 6) return p;
  }
  return null;
}

async function enforceServiceabilityLaneIfRequested(
  merged: PickupPinMerged,
  payload: VelocityForwardOrderRequest,
  body: Record<string, unknown>
) {
  const enforce = body.enforceServiceability === true || body.enforceServiceability === "true";
  if (!enforce) return;
  const toPin = String(payload.customer.pincode ?? "").replace(/\D/g, "").slice(0, 6);
  const fromPin = await resolvePickupPincodeForServiceability(merged);
  if (!fromPin || toPin.length !== 6) {
    throw new AppError(
      400,
      "Cannot verify serviceability: pickup origin or delivery pincode is not available. Link a pickup with pincode or omit enforceServiceability."
    );
  }
  const pm = payload.payment_mode === "cod" ? "cod" : "prepaid";
  const svc = await velocityService.checkServiceability({
    from: fromPin,
    to: toPin,
    payment_mode: pm,
    shipment_type: "forward",
  });
  if (!(svc.data?.length)) {
    throw new AppError(
      422,
      svc.message ||
        "This lane is not serviceable from the selected pickup to the delivery pincode. Check serviceability or choose another courier."
    );
  }
}

// ─── Serviceability ──────────────────────────────────────

export const serviceability = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { from, to, payment_mode, shipment_type } = req.body as {
    from?: string;
    to?: string;
    payment_mode?: "cod" | "prepaid";
    shipment_type?: "forward" | "return";
  };

  if (!from || !to) throw new AppError(400, "from and to pincodes are required");
  if (!payment_mode) throw new AppError(400, "payment_mode (cod|prepaid) is required");

  const fromNorm = normalizePincode(String(from).trim());
  const toNorm = normalizePincode(String(to).trim());

  const result = await velocityService.checkServiceability({
    from: fromNorm,
    to: toNorm,
    payment_mode,
    shipment_type: shipment_type ?? "forward",
  });

  const data = result.data ?? [];
  res.json({
    success: true,
    data,
    message: result.message,
    serviceable: data.length > 0,
  });
});

// ─── Rates ───────────────────────────────────────────────

export const rates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    from,
    to,
    weight,
    length,
    width,
    height,
    payment_mode,
    cod_value,
    shipment_type,
    qc_applicable,
  } = req.body as {
    from?: string;
    to?: string;
    weight?: number;
    length?: number;
    width?: number;
    height?: number;
    payment_mode?: "cod" | "prepaid";
    cod_value?: number;
    shipment_type?: "forward" | "return";
    qc_applicable?: boolean;
  };

  if (!from || !to) throw new AppError(400, "from and to pincodes are required");
  if (weight === undefined || weight === null || Number(weight) <= 0)
    throw new AppError(400, "weight (dead_weight, kg) is required");
  if (!payment_mode) throw new AppError(400, "payment_mode (cod|prepaid) is required");
  if (payment_mode === "cod") {
    if (cod_value == null || Number(cod_value) <= 0) {
      throw new AppError(400, "cod_value is required for COD (sent to Velocity as shipment_value)");
    }
  }

  const fromNorm = normalizePincode(String(from).trim());
  const toNorm = normalizePincode(String(to).trim());

  const st = shipment_type ?? "forward";
  if (st === "return" && qc_applicable !== undefined && typeof qc_applicable !== "boolean") {
    throw new AppError(400, "qc_applicable must be a boolean when provided");
  }

  const result = await velocityService.getRates({
    from: fromNorm,
    to: toNorm,
    weight: Number(weight),
    length: Number(length ?? 10),
    width: Number(width ?? 10),
    height: Number(height ?? 10),
    payment_mode,
    cod_value: cod_value != null ? Number(cod_value) : undefined,
    shipment_type: st,
    qc_applicable,
  });

  res.json({ success: true, data: result.data ?? [] });
});

// ─── Warehouse ───────────────────────────────────────────

const VELOCITY_WH_ID_PATTERN = /^WH[A-Z0-9]+$/i;

type VelocityWarehouseRegisterBody = {
  linkOnly?: boolean | string;
  warehouseId?: string;
  velocityWarehouseId?: string | number;
  unlink?: boolean | string;
};

type PickupSnapshot = {
  id: string;
  label: string;
  warehouseName?: string;
  contactName?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
  velocityWarehouseId?: string;
};

type MergedForwardContext = Record<string, unknown> & {
  warehouse_id?: string;
  pickupAddressId?: string;
  pickupWarehouseId?: string;
  pickupAddress?: PickupSnapshot;
};

/**
 * Development-only: compare raw pickup row vs list filter ownership.
 */
async function devLogVelocityLinkPickup(
  req: AuthRequest,
  oid: mongoose.Types.ObjectId,
  _pickupOwned: unknown
) {
  if (process.env.NODE_ENV !== "development") return;
  const raw = await Pickup.findById(oid).select("userId dropshipperId").lean();
  const uid = String(req.user!._id);
  devLog.info(
    "[velocity link pickup debug]",
    JSON.stringify({
      currentUserId: uid,
      pickupUserId: raw?.userId != null ? String(raw.userId) : "",
      pickupDropshipperId: raw?.dropshipperId != null ? String(raw.dropshipperId) : "",
      requestedWarehouseId: String(oid),
    })
  );
}

export const createWarehouse = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as VelocityWarehouseRegisterBody;

  if (!(body.linkOnly === true || body.linkOnly === "true")) {
    throw new AppError(
      400,
      'Warehouse creation via API is disabled — create warehouses in the Velocity dashboard. Then link: POST /api/velocity/warehouses with { "linkOnly": true, "warehouseId": "<MongoDB _id>", "velocityWarehouseId": "<Velocity code e.g. WHZBRR>" }'
    );
  }

  if (!body.warehouseId?.trim()) throw new AppError(400, "warehouseId is required for linkOnly");
  const mongoId = body.warehouseId.trim();
  const unlink = body.unlink === true || body.unlink === "true";

  if (!mongoose.isValidObjectId(mongoId)) {
    throw new AppError(400, "warehouseId must be a valid id");
  }
  const oid = new mongoose.Types.ObjectId(mongoId);

  if (unlink) {
    const pickupOwned = await Pickup.findOne(pickupByIdManageQuery(oid, req.user)).lean();
    await devLogVelocityLinkPickup(req, oid, pickupOwned);

    if (pickupOwned) {
      await Pickup.findByIdAndUpdate(oid, { $unset: { velocityWarehouseId: 1 } });
      res.json({
        success: true,
        message: "Velocity warehouse unlinked successfully",
        data: { linked: false, unlinked: true, kind: "pickup" },
      });
      return;
    }

    const pickupAny = await Pickup.findById(oid).select("_id").lean();
    if (pickupAny && req.user.role === "dropshipper") {
      throw new AppError(403, "You can only link pickup addresses that belong to your account.");
    }

    const wh = await Warehouse.findById(oid).lean();
    if (!wh) {
      throw new AppError(
        404,
        req.user.role === "dropshipper" ? "Pickup address not found" : "Warehouse or pickup address not found"
      );
    }
    await assertWarehouseAccessForVelocity(req.user, wh);
    await Warehouse.findByIdAndUpdate(oid, { $unset: { velocityWarehouseId: 1 } });
    res.json({
      success: true,
      message: "Velocity warehouse unlinked successfully",
      data: { linked: false, unlinked: true, kind: "warehouse" },
    });
    return;
  }

  const extId = body.velocityWarehouseId;
  if (extId === undefined || extId === null || String(extId).trim() === "") {
    throw new AppError(400, "velocityWarehouseId is required for linkOnly");
  }
  const vid = String(extId).trim();
  if (!VELOCITY_WH_ID_PATTERN.test(vid)) {
    throw new AppError(
      400,
      "velocityWarehouseId must match pattern WH followed by letters or digits (example: WHZBRR)"
    );
  }

  const pickupOwned = await Pickup.findOne(pickupByIdManageQuery(oid, req.user)).lean();
  await devLogVelocityLinkPickup(req, oid, pickupOwned);

  if (pickupOwned) {
    if (req.user.role === "dropshipper") {
      await Pickup.updateOne(
        {
          _id: oid,
          userId: req.user._id,
          $or: [{ dropshipperId: { $exists: false } }, { dropshipperId: null }],
        },
        { $set: { dropshipperId: req.user._id } }
      );
    }
    await Pickup.findByIdAndUpdate(oid, { velocityWarehouseId: vid });
    res.json({
      success: true,
      message: "Velocity warehouse linked successfully",
      data: { warehouse_id: vid, linked: true, manual: true, kind: "pickup" },
    });
    return;
  }

  const pickupAny = await Pickup.findById(oid).select("_id").lean();
  if (pickupAny && req.user.role === "dropshipper") {
    throw new AppError(403, "You can only link pickup addresses that belong to your account.");
  }

  const wh = await Warehouse.findById(oid).lean();
  if (!wh) {
    throw new AppError(
      404,
      req.user.role === "dropshipper" ? "Pickup address not found" : "Warehouse or pickup address not found"
    );
  }
  await assertWarehouseAccessForVelocity(req.user, wh);
  await Warehouse.findByIdAndUpdate(oid, { velocityWarehouseId: vid });
  res.json({
    success: true,
    message: "Velocity warehouse linked successfully",
    data: { warehouse_id: vid, linked: true, manual: true, kind: "warehouse" },
  });
});

// ─── Forward shipment – full orchestration ───────────────

export const createForwardShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as { orderId?: string } & Record<string, unknown>;
  let localOrder: IOrder | null = null;
  const requestOrderId = body.orderId ? String(body.orderId) : "";
  const requestWarehouseId =
    body.warehouseId != null && String(body.warehouseId).trim() !== "" ? String(body.warehouseId).trim() : "";
  const PROVIDER_ENDPOINT = "/custom/api/v1/forward-order-orchestration";

  if ((!body.orderId || String(body.orderId).trim() === "") && req.user.role !== "admin") {
    throw new AppError(400, "orderId is required to create a shipment.");
  }

  if (body.orderId) {
    localOrder = await Order.findOne({ orderId: body.orderId });
    if (!localOrder) throw new AppError(404, `Order ${body.orderId} not found`);
    await assertOrderAccess(req.user, localOrder);
    if (localOrder.awb?.trim() && localOrder.shipmentCreated) {
      throw new AppError(
        409,
        "Shipment already exists for this order. Use “Refresh tracking” to sync status, or cancel with the courier before creating again."
      );
    }
  }

  const merged = await mergeVelocityWarehouse(req, body, localOrder);
  await applyCourierPriorityRules(merged as Record<string, unknown>, localOrder);
  const resolvedVelocityWarehouseId =
    merged.warehouse_id != null && String(merged.warehouse_id).trim() !== ""
      ? String(merged.warehouse_id).trim()
      : "";
  const velocityOrderIdLooksProvider = (id: string) => /^ORD/i.test(String(id || "").trim());

  // Only use "assign AWB later" when we have a real Velocity order id (usually starts with ORD...).
  if (
    localOrder?.velocityOrderId &&
    velocityOrderIdLooksProvider(localOrder.velocityOrderId) &&
    !localOrder.awb
  ) {
    const assignPayloadEarly = buildForwardPayload(merged, localOrder);
    validateForwardPayload(assignPayloadEarly, localOrder);
    await enforceServiceabilityLaneIfRequested(merged as PickupPinMerged, assignPayloadEarly, body);
    try {
      await precheckForwardShipmentWallet(localOrder);
      const later = await velocityService.createForwardShipmentLater({
        order_id: localOrder.velocityOrderId,
        carrier_id: merged.carrier_id as string | number | undefined,
      });
      applyMergedPickupAndWarehouse(localOrder, merged);
      localOrder.awb = later.awb_code ?? localOrder.awb;
      localOrder.courier = later.carrier_name ?? localOrder.courier;
      localOrder.velocityShipmentId = later.shipment_id;
      localOrder.courierCompanyId = later.carrier_id;
      localOrder.courierName = later.carrier_name;
      localOrder.labelUrl = later.label_url;
      localOrder.shippingCharges = later.shipping_charges;
      localOrder.codCharges = later.cod_charges;
      localOrder.shipmentStatus = later.status;
      localOrder.assignedDateTime = new Date();
      applyVelocityMappedOrderStatus(localOrder, later.status, "ready-to-ship", "velocity_assign_awb");
      localOrder.shipmentCreated = true;
      if (later.awb_code) localOrder.trackingId = later.awb_code;
      await localOrder.save();
      devLog.info(
        "[velocity:forward] create_shipment_success",
        JSON.stringify({
          orderId: requestOrderId,
          warehouseId: requestWarehouseId,
          resolved_warehouse_id: resolvedVelocityWarehouseId,
          final_order_id: localOrder.velocityOrderId,
          order_items_len: Array.isArray((body as any).items) ? (body as any).items.length : undefined,
          provider_endpoint: "/custom/api/v1/forward-order-shipment",
          provider_status: undefined,
          provider_response_body: sanitizeForVelocityLog(later),
        })
      );
      const walletExtra = await forwardShipmentWalletPayload(localOrder, later.shipping_charges);
      res.status(201).json({ success: true, data: later, orderId: localOrder.orderId, ...walletExtra });
      return;
    } catch (err: unknown) {
      const e = err as any;
      const statusCode =
        e instanceof AppError && e.statusCode === 402 ? 402 : typeof e?.statusCode === "number" ? e.statusCode : 500;
      console.error(
        "[velocity:forward] create_shipment_error",
        JSON.stringify({
          orderId: requestOrderId,
          warehouseId: requestWarehouseId,
          resolved_warehouse_id: resolvedVelocityWarehouseId,
          final_order_id: localOrder.velocityOrderId,
          order_items_len: undefined,
          provider_endpoint: "/custom/api/v1/forward-order-shipment",
          provider_status: e?.providerStatusCode,
          provider_response_body: sanitizeForVelocityLog(e?.providerError),
          message: typeof e?.message === "string" ? e.message : "Create shipment failed",
        })
      );
      res.status(statusCode).json({
        success: false,
        message: err instanceof AppError ? err.message : typeof e?.message === "string" ? e.message : "Create shipment failed",
        providerError: sanitizeForVelocityLog(e?.providerError),
      });
      return;
    }
  }

  if (!merged.order_id && localOrder) {
    merged.order_id = `${localOrder.orderId}-${Date.now()}`;
  }
  const payload = buildForwardPayload(merged, localOrder);
  validateForwardPayload(payload, localOrder);
  await enforceServiceabilityLaneIfRequested(merged as PickupPinMerged, payload, body);
  await precheckForwardShipmentWallet(localOrder);
  devLog.info(
    "[velocity:forward] payload_summary",
    JSON.stringify({
      order_id: payload.order_id,
      warehouse_id: payload.warehouse_id,
      payment_method: payload.payment_mode,
      customer: payload.customer,
      order_items_count: payload.items.length,
      order_items: payload.items.map((i, idx) => ({
        idx,
        name: i.name,
        sku: i.sku,
        units: i.qty,
        selling_price: i.price,
        discount: i.discount ?? 0,
        tax: i.tax ?? 0,
      })),
    })
  );

  let result;
  let usedPayloadOrderId = payload.order_id;
  let duplicateRetryUsed = false;
  try {
    result = await velocityService.createForwardShipment(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("order already exists")) {
      if (localOrder?.awb) {
        res.status(200).json({
          success: true,
          alreadyExists: true,
          message: "Shipment already created",
          data: {
            order_id: localOrder.velocityOrderId || payload.order_id,
            shipment_id: localOrder.velocityShipmentId || localOrder.shipmentId || "",
            awb_code: localOrder.awb,
            carrier_name: localOrder.courierName || localOrder.courier,
            carrier_id: localOrder.courierCompanyId || "",
            label_url: localOrder.labelUrl,
            shipping_charges: localOrder.shippingCharges,
            cod_charges: localOrder.codCharges,
            rto_charges: localOrder.rtoCharges,
            status: localOrder.shipmentStatus || localOrder.status,
          },
          orderId: localOrder.orderId,
        });
        return;
      }

      try {
        const later = await velocityService.createForwardShipmentLater({
          order_id: localOrder?.velocityOrderId || payload.order_id,
          carrier_id: payload.carrier_id,
        });
        if (localOrder) {
          applyMergedPickupAndWarehouse(localOrder, merged);
          localOrder.awb = later.awb_code ?? localOrder.awb;
          localOrder.courier = later.carrier_name ?? localOrder.courier;
          localOrder.velocityOrderId = localOrder.velocityOrderId || payload.order_id;
          localOrder.velocityShipmentId = later.shipment_id;
          localOrder.courierCompanyId = later.carrier_id;
          localOrder.courierName = later.carrier_name;
          localOrder.labelUrl = later.label_url;
          localOrder.shippingCharges = later.shipping_charges;
          localOrder.codCharges = later.cod_charges;
          localOrder.shipmentStatus = later.status;
          localOrder.assignedDateTime = new Date();
          applyVelocityMappedOrderStatus(localOrder, later.status, "ready-to-ship", "velocity_forward_dup_retry");
          localOrder.shipmentCreated = true;
          if (later.awb_code) localOrder.trackingId = later.awb_code;
          await localOrder.save();
        }
        const wExtra = localOrder ? await forwardShipmentWalletPayload(localOrder, later.shipping_charges) : {};
        res.status(201).json({
          success: true,
          alreadyExists: true,
          data: later,
          orderId: localOrder?.orderId,
          duplicateRetryUsed: false,
          ...wExtra,
        });
        return;
      } catch {
        if (!localOrder?.awb) {
          const retryOrderIdBase = localOrder?.orderId || payload.order_id;
          const retryOrderId = `${retryOrderIdBase}-${Date.now()}`;
          const retryPayload: VelocityForwardOrderRequest = { ...payload, order_id: retryOrderId };
          devLog.info(
            "[velocity:forward] duplicate_order_retry",
            JSON.stringify({
              original_order_id: payload.order_id,
              retry_order_id: retryOrderId,
              warehouse_id: retryPayload.warehouse_id,
            })
          );
          result = await velocityService.createForwardShipment(retryPayload);
          usedPayloadOrderId = retryOrderId;
          duplicateRetryUsed = true;
        } else {
          throw new AppError(
            409,
            "This order already exists in Velocity. Try resync tracking or create shipment with a new shipment attempt."
          );
        }
      }
    }
    else {
      const e = err as any;
      console.error(
        "[velocity:forward] create_error",
        JSON.stringify({
          orderId: requestOrderId,
          warehouseId: requestWarehouseId,
          resolved_warehouse_id: resolvedVelocityWarehouseId,
          final_order_id: usedPayloadOrderId,
          order_items_len: payload.items?.length ?? 0,
          provider_endpoint: PROVIDER_ENDPOINT,
          provider_status: e?.providerStatusCode,
          provider_response_body: sanitizeForVelocityLog(e?.providerError),
          message: typeof e?.message === "string" ? e.message : "Velocity create failed",
        })
      );
      res.status(typeof e?.statusCode === "number" ? e.statusCode : 500).json({
        success: false,
        message: typeof e?.message === "string" ? e.message : "Velocity create failed",
        providerError: sanitizeForVelocityLog(e?.providerError),
      });
      return;
    }
  }

  if (localOrder) {
    applyMergedPickupAndWarehouse(localOrder, merged);
    localOrder.awb = result.awb_code ?? localOrder.awb;
    localOrder.courier = result.carrier_name ?? localOrder.courier;
    localOrder.velocityOrderId = result.order_id || usedPayloadOrderId;
    localOrder.velocityShipmentId = result.shipment_id;
    localOrder.courierCompanyId = result.carrier_id;
    localOrder.courierName = result.carrier_name;
    localOrder.labelUrl = result.label_url;
    localOrder.manifestUrl = result.manifest_url;
    localOrder.shippingCharges = result.shipping_charges;
    localOrder.codCharges = result.cod_charges;
    localOrder.rtoCharges = result.rto_charges;
    localOrder.shipmentStatus = result.status;
    localOrder.assignedDateTime = new Date();
    applyVelocityMappedOrderStatus(localOrder, result.status, "ready-to-ship", "velocity_forward_create");
    localOrder.shipmentCreated = true;
    if (result.awb_code) localOrder.trackingId = result.awb_code;
    await localOrder.save();
  }

  const walletExtraMain = await forwardShipmentWalletPayload(localOrder, result?.shipping_charges);

  devLog.info(
    "[velocity:forward] create_success",
    JSON.stringify({
      orderId: requestOrderId,
      warehouseId: requestWarehouseId,
      resolved_warehouse_id: resolvedVelocityWarehouseId,
      final_order_id: usedPayloadOrderId,
      order_items_len: payload.items?.length ?? 0,
      provider_endpoint: PROVIDER_ENDPOINT,
      provider_status: undefined,
      provider_response_body: sanitizeForVelocityLog(result),
      duplicateRetryUsed,
    })
  );
  res.status(201).json({
    success: true,
    data: result,
    orderId: localOrder?.orderId,
    duplicateRetryUsed,
    velocityOrderIdUsed: usedPayloadOrderId,
    ...walletExtraMain,
  });
});

// ─── Forward order only (no AWB) ─────────────────────────

export const createForwardOrderOnly = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as { orderId?: string } & Record<string, unknown>;
  let localOrder: IOrder | null = null;

  if ((!body.orderId || String(body.orderId).trim() === "") && req.user.role !== "admin") {
    throw new AppError(400, "orderId is required to create a forward order.");
  }

  if (body.orderId) {
    localOrder = await Order.findOne({ orderId: body.orderId });
    if (!localOrder) throw new AppError(404, `Order ${body.orderId} not found`);
    await assertOrderAccess(req.user, localOrder);
  }

  const merged = await mergeVelocityWarehouse(req, body, localOrder);
  const payload = buildForwardPayload(merged, localOrder);
  validateForwardPayload(payload, localOrder);

  const result = await velocityService.createForwardOrderOnly(payload);

  if (localOrder) {
    localOrder.velocityOrderId = result.order_id;
    localOrder.status = "ready-to-ship";
    if (payload.warehouse_id) localOrder.velocityWarehouseId = String(payload.warehouse_id);
    await localOrder.save();
  }

  res.status(201).json({ success: true, data: result });
});

// ─── Assign AWB to existing forward order ────────────────

export const createForwardShipmentLater = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { order_id, carrier_id, localOrderId } = req.body as {
    order_id?: string;
    carrier_id?: string | number;
    localOrderId?: string;
  };

  if (!order_id) throw new AppError(400, "order_id (Velocity order id) is required");

  let localOrder: IOrder | null = null;
  if (req.user.role !== "admin") {
    if (!localOrderId?.trim()) {
      throw new AppError(400, "localOrderId (your ShipAmaze order id) is required to assign AWB.");
    }
    localOrder = await Order.findOne({ orderId: localOrderId.trim() });
    if (!localOrder) throw new AppError(404, "Order not found");
    await assertOrderAccess(req.user, localOrder);
    const norm = (s: string) => String(s ?? "").trim().toUpperCase();
    if (norm(localOrder.velocityOrderId || "") !== norm(String(order_id))) {
      throw new AppError(400, "Velocity order id does not match this order. Refresh the order or create forward order first.");
    }
    if (localOrder.awb?.trim() && localOrder.shipmentCreated) {
      throw new AppError(409, "Shipment already exists for this order.");
    }
  } else if (localOrderId?.trim()) {
    localOrder = await Order.findOne({ orderId: localOrderId.trim() });
    if (localOrder) await assertOrderAccess(req.user, localOrder);
  }

  await precheckForwardShipmentWallet(localOrder);

  const result = await velocityService.createForwardShipmentLater({ order_id, carrier_id });

  if (localOrder) {
    localOrder.awb = result.awb_code ?? localOrder.awb;
    localOrder.courier = result.carrier_name ?? localOrder.courier;
    localOrder.velocityShipmentId = result.shipment_id;
    localOrder.courierName = result.carrier_name;
    localOrder.courierCompanyId = result.carrier_id;
    localOrder.labelUrl = result.label_url;
    localOrder.shippingCharges = result.shipping_charges;
    localOrder.codCharges = result.cod_charges;
    localOrder.shipmentStatus = result.status;
    localOrder.assignedDateTime = new Date();
    applyVelocityMappedOrderStatus(localOrder, result.status, "ready-to-ship", "velocity_forward_awb_later");
    await localOrder.save();
  }

  const wExtra = await forwardShipmentWalletPayload(localOrder, result.shipping_charges);
  res.json({ success: true, data: result, ...wExtra });
});

// ─── Reverse / Return – full orchestration ───────────────

export const createReverseShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as { orderId?: string } & Record<string, unknown>;
  let localOrder: IOrder | null = null;

  if (body.orderId) {
    localOrder = await Order.findOne({ orderId: body.orderId });
    if (!localOrder) throw new AppError(404, `Order ${body.orderId} not found`);
    await assertOrderAccess(req.user, localOrder);
  }

  const merged = await mergeVelocityWarehouse(req, body, localOrder);
  const partial = buildReversePayload(merged, localOrder);
  if (!partial.warehouse_id)
    throw new AppError(
      400,
      "No Velocity warehouse linked. Please link warehouse first."
    );
  if (!partial.pickup_customer) throw new AppError(400, "pickup_customer details are required");

  const result = await velocityService.createReverseShipment(partial as VelocityReverseOrderRequest);

  if (localOrder) {
    localOrder.velocityReturnId = result.return_id;
    localOrder.velocityShipmentId = result.shipment_id;
    localOrder.awb = result.awb_code ?? localOrder.awb;
    localOrder.courier = result.carrier_name ?? localOrder.courier;
    localOrder.courierName = result.carrier_name;
    localOrder.courierCompanyId = result.carrier_id;
    localOrder.labelUrl = result.label_url;
    localOrder.shipmentStatus = result.status;
    applyVelocityMappedOrderStatus(localOrder, result.status, "rto", "velocity_reverse_create");
    if (partial.warehouse_id) localOrder.velocityWarehouseId = String(partial.warehouse_id);
    await localOrder.save();
  }

  res.status(201).json({ success: true, data: result });
});

// ─── Reverse order only ───────────────────────────────────

export const createReverseOrderOnly = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const merged = await mergeVelocityWarehouse(req, req.body as Record<string, unknown>, null);
  if (!merged.order_id || String(merged.order_id).trim() === "")
    throw new AppError(400, "order_id is required");

  if (!merged.warehouse_id || String(merged.warehouse_id).trim() === "") {
    throw new AppError(
      400,
      "No Velocity warehouse linked. Please link warehouse first."
    );
  }

  const result = await velocityService.createReverseOrderOnly(merged as unknown as VelocityReverseOrderRequest);
  res.status(201).json({ success: true, data: result });
});

// ─── Assign AWB to existing reverse order ────────────────

export const createReverseShipmentLater = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { order_id, carrier_id, localOrderId } = req.body as {
    order_id?: string;
    carrier_id?: string | number;
    localOrderId?: string;
  };

  if (!order_id) throw new AppError(400, "order_id is required");

  let localOrder: IOrder | null = null;
  if (localOrderId?.trim()) {
    localOrder = await Order.findOne({ orderId: localOrderId.trim() });
    if (!localOrder) throw new AppError(404, "Order not found");
    await assertOrderAccess(req.user, localOrder);
  } else if (req.user.role !== "admin") {
    throw new AppError(400, "localOrderId is required to assign reverse AWB.");
  }

  const result = await velocityService.createReverseShipmentLater({ order_id, carrier_id });

  if (localOrder) {
    localOrder.velocityShipmentId = result.shipment_id;
    localOrder.awb = result.awb_code ?? localOrder.awb;
    localOrder.courier = result.carrier_name ?? localOrder.courier;
    localOrder.courierName = result.carrier_name;
    localOrder.courierCompanyId = result.carrier_id;
    localOrder.labelUrl = result.label_url;
    localOrder.shipmentStatus = result.status;
    const mapped = mapVelocityStatus(result.status);
    if (mapped && shouldApplyInternalStatusUpdate(localOrder.status, mapped)) {
      if (localOrder.status !== mapped) appendStatusHistoryEntry(localOrder, mapped, "velocity_reverse_awb");
      localOrder.status = mapped;
    }
    await localOrder.save();
  }

  res.json({ success: true, data: result });
});

// ─── Cancel ──────────────────────────────────────────────

export const cancelShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { awbs, orderId } = req.body as { awbs?: string[]; orderId?: string };
  if (!awbs?.length) throw new AppError(400, "awbs array is required");

  const uniqueAwbs = [...new Set(awbs.map((a) => String(a).trim()).filter(Boolean))];
  if (req.user.role !== "admin") {
    const orders = await Order.find({ awb: { $in: uniqueAwbs } }).exec();
    if (orders.length !== uniqueAwbs.length) {
      throw new AppError(403, "One or more AWBs are not linked to your account.");
    }
    for (const o of orders) {
      await assertOrderAccess(req.user, o);
    }
  }

  const result = await velocityService.cancelShipment({ awbs: uniqueAwbs });

  if (orderId && result.success) {
    const localOrder = await Order.findOne({ orderId });
    if (localOrder) {
      await assertOrderAccess(req.user, localOrder);
      localOrder.status = "cancelled";
      localOrder.shipmentStatus = "cancelled";
      appendStatusHistoryEntry(localOrder, "cancelled", "velocity_cancel");
      await localOrder.save();
    }
  }

  res.json({ success: true, data: result });
});

// ─── Tracking (authenticated) ─────────────────────────────

export const trackShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { awb, orderId } = req.body as { awb?: string; orderId?: string };
  if (!awb) throw new AppError(400, "awb is required");

  if (orderId) {
    const localOrderById = await Order.findOne({ orderId });
    if (localOrderById) await assertOrderAccess(req.user, localOrderById);
  } else {
    const localOrderByAwb = await Order.findOne({ awb });
    if (localOrderByAwb) await assertOrderAccess(req.user, localOrderByAwb);
  }

  const result = await velocityService.trackShipment({ awb });

  const localOrder = await Order.findOne(orderId ? { orderId } : { awb });
  if (localOrder) {
    localOrder.shipmentStatus = result.status;
    localOrder.trackingActivities = result.shipment_track_activities ?? localOrder.trackingActivities;
    const internalStatus = mapVelocityStatus(result.status);
    if (
      internalStatus &&
      shouldApplyInternalStatusUpdate(localOrder.status, internalStatus) &&
      localOrder.status !== internalStatus
    ) {
      appendStatusHistoryEntry(localOrder, internalStatus, "velocity_track");
      localOrder.status = internalStatus;
    }
    await localOrder.save();
  }

  res.json({
    success: true,
    data: {
      awb: result.awb,
      status: result.status,
      carrierName: result.carrier_name,
      activities: result.shipment_track_activities ?? [],
    },
  });
});

// ─── Tracking – public (no auth) ─────────────────────────

export const trackShipmentPublic = asyncHandler(async (req: Request, res: Response) => {
  const raw = String((req.params as { awb?: string }).awb ?? "").trim();
  if (!raw) throw new AppError(400, "Tracking reference is required");

  const localOrderLean = await Order.findOne({
    $or: [{ awb: raw }, { orderId: raw }, { trackingId: raw }],
  }).lean();
  if (!localOrderLean) throw new AppError(404, "Tracking reference not found");

  const orderPlain = localOrderLean as unknown as Record<string, unknown>;
  const orderDetails = buildPublicOrderDetails(orderPlain);

  const awbToTrack = String(localOrderLean.awb || "").trim() || raw;

  if (!String(localOrderLean.awb || "").trim()) {
    res.json({
      success: true,
      data: {
        awb: raw,
        status: localOrderLean.status,
        carrierName: localOrderLean.courierName ?? localOrderLean.courier,
        activities: localOrderLean.trackingActivities ?? [],
        order: { id: localOrderLean.orderId },
        orderDetails,
        pendingShipment: true,
      },
    });
    return;
  }

  try {
    const result = await velocityService.trackShipment({ awb: awbToTrack });

    const doc = await Order.findById(localOrderLean._id);
    if (doc) {
      doc.shipmentStatus = result.status;
      doc.trackingActivities = result.shipment_track_activities ?? doc.trackingActivities;
      const internalStatus = mapVelocityStatus(result.status);
      if (
        internalStatus &&
        shouldApplyInternalStatusUpdate(doc.status, internalStatus) &&
        doc.status !== internalStatus
      ) {
        appendStatusHistoryEntry(doc, internalStatus, "velocity_public_track");
        doc.status = internalStatus;
      }
      await doc.save();
    }

    res.json({
      success: true,
      data: {
        awb: result.awb || awbToTrack,
        status: result.status,
        carrierName: result.carrier_name ?? localOrderLean.courierName ?? localOrderLean.courier,
        activities: result.shipment_track_activities ?? [],
        trackUrl: (result as { track_url?: string }).track_url,
        order: { id: localOrderLean.orderId },
        orderDetails,
        trackingUnavailable: false,
      },
    });
  } catch {
    res.json({
      success: true,
      data: {
        awb: awbToTrack,
        status: localOrderLean.shipmentStatus ?? localOrderLean.status,
        carrierName: localOrderLean.courierName ?? localOrderLean.courier,
        activities: localOrderLean.trackingActivities ?? [],
        order: { id: localOrderLean.orderId },
        orderDetails,
        trackingUnavailable: true,
        trackingMessage: "Live tracking is temporarily unavailable. Showing the last saved status.",
      },
    });
  }
});

// ─── Lists / Reports (admin only) ────────────────────────

export const listVelocityShipments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const result = await velocityService.listShipments(req.body as Record<string, unknown>);
  res.json({ success: true, data: result.data ?? [], total: result.total });
});

export const listVelocityReturns = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const result = await velocityService.listReturns(req.body as Record<string, unknown>);
  res.json({ success: true, data: result.data ?? [], total: result.total });
});

export const getVelocityReports = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const result = await velocityService.getReports(req.body as Record<string, unknown>);
  res.json({ success: true, data: result.data ?? [] });
});

// ─── Helpers ─────────────────────────────────────────────

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function firstPositiveNumber(...vals: unknown[]): number {
  for (const v of vals) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return NaN;
}

function orderPlain(lo: IOrder | null): Record<string, unknown> {
  if (!lo) return {};
  const doc = lo as unknown as { toObject?: () => Record<string, unknown> };
  if (typeof doc.toObject === "function") return doc.toObject();
  return { ...(lo as unknown as Record<string, unknown>) };
}

function parseWeightKgFromOrder(weight?: string): number {
  if (!weight?.trim()) return 0;
  const m = weight.match(/[\d.]+/);
  return m ? Number.parseFloat(m[0]) : 0;
}

/** First `LxWxH` segment from `dimensions` (may be multiple `;`-separated boxes). */
function parseBoxCmFromDimensions(dimensions?: string): { length: number; width: number; height: number } | undefined {
  if (!dimensions?.trim()) return undefined;
  const first = dimensions.split(";")[0].trim().replace(/cm/gi, "").trim();
  const parts = first.split(/x/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return undefined;
  const nums = parts.map((p) => Number.parseFloat(p)).filter((n) => !Number.isNaN(n));
  if (nums.length < 3) return undefined;
  return { length: nums[0], width: nums[1], height: nums[2] };
}

function toObjectArray(input: unknown): Array<Record<string, unknown>> {
  return Array.isArray(input) ? (input.filter((x) => typeof x === "object" && x !== null) as Array<Record<string, unknown>>) : [];
}

function firstItemArrayFromOrder(o: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [
    o.items,
    o.orderItems,
    o.products,
    o.productDetails,
    o.lineItems,
    o.shopifyLineItems,
    o.cartItems,
  ];
  for (const c of candidates) {
    const arr = toObjectArray(c);
    if (arr.length > 0) return arr;
  }
  return [];
}

function resolveShippingRecord(
  bodyCustomer: Record<string, unknown> | undefined,
  o: Record<string, unknown>
): Record<string, unknown> | undefined {
  const fromBody = bodyCustomer?.shippingAddress as Record<string, unknown> | undefined;
  const fromOrder =
    (o.shippingAddress as Record<string, unknown> | undefined) ||
    (o.shipping_address as Record<string, unknown> | undefined);
  return fromBody || fromOrder;
}

/** Maps Order + optional `body.customer` into VelocityCustomer (pincode: up to 6 digits). */
function buildCustomerForForwardPayload(
  body: Record<string, unknown>,
  localOrder: IOrder | null
): VelocityCustomer {
  const b = body.customer as Record<string, unknown> | undefined;
  const o = orderPlain(localOrder);
  const ship = resolveShippingRecord(b, o);

  const name = firstNonEmpty(
    b?.name,
    o.customerName,
    o.consigneeName,
    ship?.name,
    o.customer,
    localOrder?.customer
  );
  const phone = firstNonEmpty(
    b?.phone,
    o.customerPhone,
    o.phone,
    ship?.phone,
    localOrder?.phone
  );
  const email = firstNonEmpty(b?.email, o.customerEmail, o.email, ship?.email);
  const address = firstNonEmpty(
    b?.address,
    o.customerAddress,
    o.addressLine1,
    ship?.address,
    ship?.street,
    ship?.addressLine1,
    o.address,
    localOrder?.address
  );
  const city = firstNonEmpty(b?.city, o.customerCity, ship?.city, o.city, localOrder?.city);
  const state = firstNonEmpty(
    b?.state,
    b?.shippingState,
    o.customerState,
    o.shippingState,
    ship?.state,
    o.state,
    localOrder?.state
  );
  const pinRaw = firstNonEmpty(
    b?.pincode,
    b?.shippingPincode,
    b?.customerPincode,
    b?.zip,
    b?.postalCode,
    o.customerPincode,
    o.shippingPincode,
    o.pincode,
    o.zip,
    o.postalCode,
    ship?.pincode,
    ship?.zip,
    ship?.postalCode,
    localOrder?.pincode
  );
  const pincode = pinRaw.replace(/\D/g, "").slice(0, 6);
  const country = firstNonEmpty(b?.country, ship?.country, o.country as string) || "India";

  return {
    name,
    phone,
    email: email || undefined,
    address,
    city,
    state,
    pincode,
    country,
  };
}

function mergeForwardCustomer(body: Record<string, unknown>, localOrder: IOrder | null): VelocityCustomer {
  const base = buildCustomerForForwardPayload(body, localOrder);
  const ov = body.customer as Record<string, unknown> | undefined;
  if (!ov || typeof ov !== "object") return base;

  const pinFrom = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 6);

  return {
    name: firstNonEmpty(ov.name, base.name),
    phone: firstNonEmpty(ov.phone, base.phone),
    email: firstNonEmpty(ov.email, base.email ?? "") || undefined,
    address: firstNonEmpty(ov.address, base.address),
    city: firstNonEmpty(ov.city, base.city),
    state: firstNonEmpty(ov.state, base.state),
    pincode: pinFrom(ov.pincode ?? ov.zip) || base.pincode,
    country: firstNonEmpty(ov.country, base.country) || "India",
  };
}

function buildForwardPayload(
  body: Record<string, unknown>,
  localOrder: IOrder | null
): VelocityForwardOrderRequest {
  const products = localOrder?.products as Array<Record<string, unknown>> | undefined;

  const rawCarrier = body.carrier_id;
  let carrierId: string | number | undefined;
  if (rawCarrier !== undefined && rawCarrier !== null && String(rawCarrier).trim() !== "") {
    const s = String(rawCarrier).trim();
    carrierId = /^\d+$/.test(s) ? Number(s) : s;
  }

  const op = orderPlain(localOrder);
  const ship = (op.shippingAddress as Record<string, unknown> | undefined) ?? undefined;
  const box = parseBoxCmFromDimensions(
    firstNonEmpty(
      String(op.dimensions ?? ""),
      localOrder?.dimensions,
      (ship?.dimensions as string) ?? "",
    )
  );
  const wKg = parseWeightKgFromOrder(firstNonEmpty(String(op.weight ?? ""), localOrder?.weight));

  const weight = firstPositiveNumber(
    body.weight,
    body.packageWeight,
    body.deadWeight,
    op.weight,
    op.packageWeight,
    op.deadWeight,
    wKg,
  );
  const length = firstPositiveNumber(
    body.length,
    body.packageLength,
    op.length,
    op.packageLength,
    box?.length,
  );
  const width = firstPositiveNumber(
    body.width,
    body.breadth,
    body.packageBreadth,
    body.packageWidth,
    op.width,
    op.breadth,
    op.packageBreadth,
    op.packageWidth,
    box?.width,
  );
  const height = firstPositiveNumber(
    body.height,
    body.packageHeight,
    op.height,
    op.packageHeight,
    box?.height,
  );

  const sourceItems = [
    ...toObjectArray(body.items),
    ...toObjectArray(body.orderItems),
    ...toObjectArray(body.products),
    ...toObjectArray(body.productDetails),
    ...toObjectArray(body.lineItems),
    ...toObjectArray(body.shopifyLineItems),
    ...toObjectArray(body.cartItems),
  ];
  const orderItems = localOrder ? firstItemArrayFromOrder(op) : products ?? [];
  const seed = sourceItems.length > 0 ? sourceItems : orderItems;

  let items: VelocityForwardOrderRequest["items"] = seed.map((it, idx) => {
    const name = firstNonEmpty(it.name, it.productName, it.title, "Item");
    const sku = firstNonEmpty(it.sku, it.productSku, `SKU-${idx + 1}`);
    const qty = Number(it.quantity ?? it.qty ?? it.units ?? 1);
    const price = Number(
      it.price ??
      it.sellingPrice ??
      it.amount ??
      op.sub_total ??
      op.totalAmount ??
      op.amount ??
      1
    );
    return {
      name,
      sku,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      price: Number.isFinite(price) && price > 0 ? price : 1,
      weight: it.weight != null ? Number(it.weight) : undefined,
      discount: Number(it.discount ?? 0) || 0,
      tax: Number(it.tax ?? 0) || 0,
    };
  });

  const hasTopLevelItemHint =
    op.productName != null ||
    op.product != null ||
    op.sku != null ||
    op.quantity != null ||
    op.qty != null ||
    op.subTotal != null ||
    op.totalAmount != null ||
    op.amount != null;

  if (!items.length && hasTopLevelItemHint) {
    const fallbackName = firstNonEmpty(op.productName, op.product, "Shipment Item");
    const fallbackSku = firstNonEmpty(op.sku, `SKU-${String(op.orderId ?? localOrder?.orderId ?? "order")}`);
    const fallbackQty = Number(op.quantity ?? op.qty ?? 1);
    const fallbackPrice = Number(op.subTotal ?? op.totalAmount ?? op.amount ?? 1);
    items = [{
      name: fallbackName,
      sku: fallbackSku,
      qty: Number.isFinite(fallbackQty) && fallbackQty > 0 ? fallbackQty : 1,
      price: Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : 1,
      discount: 0,
      tax: 0,
    }];
  }

  return {
    warehouse_id:
      (body.warehouse_id as string) ??
      (localOrder?.velocityWarehouseId ?? ""),
    order_id: (body.order_id as string) ?? (localOrder?.orderId ?? ""),
    payment_mode: ((body.payment_mode as string) ??
      (localOrder?.payment?.toLowerCase() === "cod" ? "cod" : "prepaid")) as "cod" | "prepaid",
    cod_amount:
      (body.cod_amount as number) ??
      (localOrder?.payment?.toLowerCase() === "cod" ? localOrder?.amount : undefined),
    order_amount: (body.order_amount as number) ?? (localOrder?.amount ?? 0),
    weight,
    length,
    width,
    height,
    customer: mergeForwardCustomer(body, localOrder),
    items,
    carrier_id: carrierId,
  };
}

function validateForwardPayload(payload: VelocityForwardOrderRequest, localOrder: IOrder | null) {
  const missing: string[] = [];
  if (!payload.warehouse_id) missing.push("linked Velocity warehouse");
  if (!payload.order_id) missing.push("order_id");
  const c = payload.customer;
  const pinDigits = String(c?.pincode ?? "").replace(/\D/g, "");
  if (pinDigits.length !== 6) missing.push("customer pincode");
  if (!String(c?.phone ?? "").trim()) missing.push("customer phone");
  if (!String(c?.address ?? "").trim()) missing.push("delivery address");
  if (!String(c?.city ?? "").trim()) missing.push("customer city");
  if (!String(c?.state ?? "").trim()) missing.push("customer state");
  if (!String(c?.name ?? "").trim()) missing.push("customer name");
  if (!payload.items?.length) {
    const isShopify = String(localOrder?.externalSource ?? "").toLowerCase() === "shopify";
    if (isShopify) {
      throw new AppError(400, "This synced Shopify order has no product items saved. Please resync Shopify orders.");
    }
    throw new AppError(400, "Order items are missing. Please edit the order and add at least one product.");
  }
  const unnamed = payload.items.find((i) => !String(i.name ?? "").trim());
  if (unnamed) {
    throw new AppError(
      400,
      "Each order item must have a name. Please edit the order and fix products."
    );
  }
  if (!(Number(payload.weight) > 0) || Number.isNaN(Number(payload.weight))) missing.push("package weight");
  if (!(Number(payload.length) > 0) || Number.isNaN(Number(payload.length))) missing.push("package length");
  if (!(Number(payload.width) > 0) || Number.isNaN(Number(payload.width))) missing.push("package breadth/width");
  if (!(Number(payload.height) > 0) || Number.isNaN(Number(payload.height))) missing.push("package height");

  if (missing.length) {
    throw new AppError(400, `Missing required shipment fields: ${missing.join(", ")}`);
  }
}

function buildReversePayload(
  body: Record<string, unknown>,
  localOrder: IOrder | null
): Partial<VelocityReverseOrderRequest> {
  const products = localOrder?.products as Array<Record<string, unknown>> | undefined;

  return {
    warehouse_id:
      (body.warehouse_id as string) ??
      (localOrder?.velocityWarehouseId ?? ""),
    order_id: (body.order_id as string) ?? (localOrder?.orderId ?? ""),
    pickup_customer: (body.pickup_customer as VelocityReverseOrderRequest["pickup_customer"]) ?? {
      name: localOrder?.customer ?? "",
      phone: localOrder?.phone ?? "",
      address: localOrder?.address ?? "",
      city: localOrder?.city ?? "",
      state: localOrder?.state ?? "",
      pincode: localOrder?.pincode ?? "",
    },
    weight: (body.weight as number) ?? parseFloat(localOrder?.weight ?? "0.5"),
    length: (body.length as number) ?? 10,
    width: (body.width as number) ?? 10,
    height: (body.height as number) ?? 10,
    items:
      (body.items as VelocityReverseOrderRequest["items"]) ??
      products?.map((p) => ({
        name: String(p.name ?? "Item"),
        qty: Number(p.qty ?? 1),
        price: Number(p.price ?? 0),
      })) ?? [{ name: "Product", qty: 1, price: localOrder?.amount ?? 0 }],
    qc: body.qc as boolean | undefined,
  };
}

async function mergeVelocityWarehouse(
  req: AuthRequest,
  body: Record<string, unknown>,
  localOrder: IOrder | null
): Promise<MergedForwardContext> {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const out: MergedForwardContext = { ...body };

  const explicit =
    out.warehouse_id != null && String(out.warehouse_id).trim() !== ""
      ? String(out.warehouse_id).trim()
      : "";
  const fromOrder = localOrder?.velocityWarehouseId?.trim() ?? "";

  if (explicit) {
    await assertVelocityWarehouseCodeOwned(req.user, explicit);
    out.warehouse_id = explicit;
    return out;
  }

  if (fromOrder) {
    out.warehouse_id = fromOrder;
    return out;
  }

  const mongoWhId = out.warehouseId ?? out.pickupWarehouseId;
  if (mongoWhId != null && String(mongoWhId).trim() !== "") {
    const id = String(mongoWhId).trim();
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError(400, "Invalid warehouseId");
    }
    const oid = new mongoose.Types.ObjectId(id);

    const puOwned = await Pickup.findOne(pickupByIdManageQuery(oid, req.user!)).lean();

    if (req.user!.role === "dropshipper") {
      if (puOwned) {
        if (!puOwned.velocityWarehouseId?.trim()) {
          throw new AppError(400, "No Velocity warehouse linked. Please link warehouse first.");
        }
        out.warehouse_id = puOwned.velocityWarehouseId.trim();
        const pid = String(puOwned._id);
        out.pickupAddressId = pid;
        out.pickupWarehouseId = pid;
        out.pickupAddress = toPickupSnapshot(puOwned);
        return out;
      }
      const wh = await Warehouse.findById(oid).lean();
      if (wh) {
        throw new AppError(
          403,
          "Select your linked pickup address for shipments. A vendor warehouse ID cannot be used as a dropshipper."
        );
      }
      throw new AppError(404, "Local warehouse not found");
    }

    const wh = await Warehouse.findById(oid).lean();
    if (wh) {
      await assertWarehouseAccessForVelocity(req.user!, wh);
      if (!wh.velocityWarehouseId?.trim()) {
        throw new AppError(400, "No Velocity warehouse linked. Please link warehouse first.");
      }
      out.warehouse_id = wh.velocityWarehouseId.trim();
      return out;
    }
    if (puOwned) {
      if (!puOwned.velocityWarehouseId?.trim()) {
        throw new AppError(400, "No Velocity warehouse linked. Please link warehouse first.");
      }
      out.warehouse_id = puOwned.velocityWarehouseId.trim();
      const pid = String(puOwned._id);
      out.pickupAddressId = pid;
      out.pickupWarehouseId = pid;
      out.pickupAddress = toPickupSnapshot(puOwned);
      return out;
    }
    throw new AppError(404, "Local warehouse not found");
  }

  if (localOrder?.pickupAddressId) {
    const p = await Pickup.findOne(pickupByIdManageQuery(localOrder.pickupAddressId, req.user!)).lean();
    if (p?.velocityWarehouseId?.trim()) {
      out.warehouse_id = p.velocityWarehouseId.trim();
      const pid = String(p._id);
      out.pickupAddressId = pid;
      out.pickupWarehouseId = pid;
      out.pickupAddress = toPickupSnapshot(p);
      return out;
    }
  }

  return out;
}

function toPickupSnapshot(pickup: Record<string, unknown>): PickupSnapshot {
  const label = String(pickup.label ?? "Pickup Address");
  const address = [pickup.addressLine1, pickup.addressLine2, pickup.landmark]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return {
    id: String(pickup._id ?? ""),
    label,
    warehouseName: label,
    contactName: String(pickup.contactName ?? ""),
    phone: String(pickup.phone ?? ""),
    alternatePhone: String(pickup.alternatePhone ?? ""),
    email: String(pickup.email ?? ""),
    address,
    city: String(pickup.city ?? ""),
    state: String(pickup.state ?? ""),
    pincode: String(pickup.pincode ?? ""),
    country: String(pickup.country ?? "India"),
    gstin: String(pickup.gstin ?? ""),
    velocityWarehouseId: String(pickup.velocityWarehouseId ?? ""),
  };
}

function applyMergedPickupAndWarehouse(
  order: IOrder,
  merged: MergedForwardContext,
) {
  if (merged.warehouse_id && String(merged.warehouse_id).trim()) {
    order.velocityWarehouseId = String(merged.warehouse_id).trim();
  }
  if (merged.pickupAddressId && mongoose.isValidObjectId(String(merged.pickupAddressId))) {
    order.pickupAddressId = new mongoose.Types.ObjectId(String(merged.pickupAddressId));
    order.set("pickupWarehouseId", String(merged.pickupAddressId));
  }
  if (merged.pickupWarehouseId && String(merged.pickupWarehouseId).trim()) {
    order.set("pickupWarehouseId", String(merged.pickupWarehouseId).trim());
  }
  if (merged.pickupAddress && typeof merged.pickupAddress === "object") {
    order.pickupAddress = merged.pickupAddress as IOrder["pickupAddress"];
  }
}

async function assertWarehouseAccessForVelocity(
  user: NonNullable<AuthRequest["user"]>,
  wh: { vendorId: unknown }
) {
  if (user.role === "admin") return;
  if (user.role === "vendor") {
    const vendor = await Vendor.findOne({ userId: user._id }).select("_id").lean();
    if (!vendor) throw new AppError(403, "Vendor profile not found.");
    if (String(wh.vendorId) !== String(vendor._id)) {
      throw new AppError(403, "You can only link your own warehouses.");
    }
    return;
  }
  throw new AppError(403, "Forbidden");
}

/** Ensures a Velocity warehouse code is linked to this user (vendor Warehouse or dropshipper Pickup). */
async function assertVelocityWarehouseCodeOwned(
  user: NonNullable<AuthRequest["user"]>,
  code: string
) {
  const c = code.trim();
  if (user.role === "admin") return;

  if (user.role === "vendor") {
    const vendor = await Vendor.findOne({ userId: user._id }).select("_id").lean();
    if (!vendor) throw new AppError(403, "Forbidden");
    const w = await Warehouse.findOne({ vendorId: vendor._id, velocityWarehouseId: c }).lean();
    if (!w) throw new AppError(403, "Forbidden");
    return;
  }

  if (user.role === "dropshipper") {
    const p = await Pickup.findOne({
      $and: [
        { velocityWarehouseId: c },
        { $or: [{ userId: user._id }, { dropshipperId: user._id }] },
        { ...PICKUP_NOT_DELETED },
      ],
    }).lean();
    if (!p) throw new AppError(403, "Forbidden");
    return;
  }

  throw new AppError(403, "Forbidden");
}

async function assertOrderAccess(user: NonNullable<AuthRequest["user"]>, order: IOrder) {
  if (user.role === "admin") return;

  if (user.role === "dropshipper") {
    if (
      String(order.createdBy) !== String(user._id) &&
      String(order.ownerUserId ?? "") !== String(user._id)
    ) {
      throw new AppError(403, "Forbidden");
    }
    return;
  }

  if (user.role === "vendor") {
    const vendor = await Vendor.findOne({ userId: user._id }).select("_id").lean();
    if (!vendor) throw new AppError(403, "Forbidden");
    if (String(order.vendorId ?? "") !== String(vendor._id)) {
      throw new AppError(403, "Forbidden");
    }
    return;
  }

  throw new AppError(403, "Forbidden");
}
