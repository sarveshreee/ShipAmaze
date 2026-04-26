/**
 * Velocity Shipping – Express controllers.
 * Each handler validates, calls the service, and handles Order model side-effects.
 */

import type { Request, Response } from "express";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { Order, type IOrder } from "../../models/Order.js";
import { Warehouse } from "../../models/Warehouse.js";
import * as velocityService from "./velocity.service.js";
import { mapVelocityStatus } from "./velocity.mapper.js";
import type {
  VelocityForwardOrderRequest,
  VelocityReverseOrderRequest,
  VelocityWarehouseRequest,
} from "./velocity.types.js";

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

  const result = await velocityService.checkServiceability({
    from,
    to,
    payment_mode,
    shipment_type: shipment_type ?? "forward",
  });

  res.json({ success: true, data: result.data ?? [] });
});

// ─── Rates ───────────────────────────────────────────────

export const rates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { from, to, weight, length, width, height, payment_mode, cod_value, shipment_type } =
    req.body as {
      from?: string;
      to?: string;
      weight?: number;
      length?: number;
      width?: number;
      height?: number;
      payment_mode?: "cod" | "prepaid";
      cod_value?: number;
      shipment_type?: "forward" | "return";
    };

  if (!from || !to) throw new AppError(400, "from and to pincodes are required");
  if (!weight) throw new AppError(400, "weight (kg) is required");
  if (!payment_mode) throw new AppError(400, "payment_mode (cod|prepaid) is required");

  const result = await velocityService.getRates({
    from,
    to,
    weight: Number(weight),
    length: Number(length ?? 10),
    width: Number(width ?? 10),
    height: Number(height ?? 10),
    payment_mode,
    cod_value: cod_value ? Number(cod_value) : undefined,
    shipment_type: shipment_type ?? "forward",
  });

  res.json({ success: true, data: result.data ?? [] });
});

// ─── Warehouse ───────────────────────────────────────────

export const createWarehouse = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as Partial<VelocityWarehouseRequest> & { warehouseId?: string };

  if (body.warehouseId) {
    const wh = await Warehouse.findById(body.warehouseId).lean();
    if (!wh) throw new AppError(404, "Warehouse not found");

    const payload: VelocityWarehouseRequest = {
      name: wh.name,
      address: [wh.addressLine1, wh.addressLine2].filter(Boolean).join(", "),
      city: wh.city,
      state: wh.state,
      pincode: wh.pincode,
      contact_name: wh.contactName ?? wh.name,
      contact_phone: wh.phone ?? "",
    };

    const result = await velocityService.createWarehouse(payload);

    await Warehouse.findByIdAndUpdate(body.warehouseId, {
      velocityWarehouseId: String(result.warehouse_id),
    });

    res.status(201).json({ success: true, data: result });
    return;
  }

  const { name, address, city, state, pincode, contact_name, contact_phone } = body;
  if (!name || !address || !city || !state || !pincode || !contact_name || !contact_phone) {
    throw new AppError(400, "name, address, city, state, pincode, contact_name, contact_phone are required");
  }

  const result = await velocityService.createWarehouse({
    name,
    address,
    city,
    state,
    pincode,
    contact_name,
    contact_phone,
  });

  res.status(201).json({ success: true, data: result });
});

// ─── Forward shipment – full orchestration ───────────────

export const createForwardShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as { orderId?: string } & Record<string, unknown>;
  let localOrder: IOrder | null = null;

  if (body.orderId) {
    localOrder = await Order.findOne({ orderId: body.orderId });
    if (!localOrder) throw new AppError(404, `Order ${body.orderId} not found`);
    if (req.user.role === "dropshipper" && String(localOrder.createdBy) !== String(req.user._id)) {
      throw new AppError(403, "Forbidden");
    }
  }

  const payload = buildForwardPayload(body, localOrder);
  validateForwardPayload(payload);

  const result = await velocityService.createForwardShipment(payload);

  if (localOrder) {
    localOrder.awb = result.awb_code ?? localOrder.awb;
    localOrder.courier = result.carrier_name ?? localOrder.courier;
    localOrder.velocityOrderId = result.order_id;
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
    localOrder.status = mapVelocityStatus(result.status) || "ready-to-ship";
    await localOrder.save();
  }

  res.status(201).json({ success: true, data: result, orderId: localOrder?.orderId });
});

// ─── Forward order only (no AWB) ─────────────────────────

export const createForwardOrderOnly = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as { orderId?: string } & Record<string, unknown>;
  let localOrder: IOrder | null = null;

  if (body.orderId) {
    localOrder = await Order.findOne({ orderId: body.orderId });
    if (!localOrder) throw new AppError(404, `Order ${body.orderId} not found`);
    if (req.user.role === "dropshipper" && String(localOrder.createdBy) !== String(req.user._id)) {
      throw new AppError(403, "Forbidden");
    }
  }

  const payload = buildForwardPayload(body, localOrder);
  validateForwardPayload(payload);

  const result = await velocityService.createForwardOrderOnly(payload);

  if (localOrder) {
    localOrder.velocityOrderId = result.order_id;
    localOrder.status = "ready-to-ship";
    await localOrder.save();
  }

  res.status(201).json({ success: true, data: result });
});

// ─── Assign AWB to existing forward order ────────────────

export const createForwardShipmentLater = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { order_id, carrier_id, localOrderId } = req.body as {
    order_id?: string;
    carrier_id?: number;
    localOrderId?: string;
  };

  if (!order_id) throw new AppError(400, "order_id (Velocity order id) is required");

  const result = await velocityService.createForwardShipmentLater({ order_id, carrier_id });

  if (localOrderId) {
    const localOrder = await Order.findOne({ orderId: localOrderId });
    if (localOrder) {
      if (req.user.role === "dropshipper" && String(localOrder.createdBy) !== String(req.user._id)) {
        throw new AppError(403, "Forbidden");
      }
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
      localOrder.status = mapVelocityStatus(result.status) || "ready-to-ship";
      await localOrder.save();
    }
  }

  res.json({ success: true, data: result });
});

// ─── Reverse / Return – full orchestration ───────────────

export const createReverseShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as { orderId?: string } & Record<string, unknown>;
  let localOrder: IOrder | null = null;

  if (body.orderId) {
    localOrder = await Order.findOne({ orderId: body.orderId });
    if (!localOrder) throw new AppError(404, `Order ${body.orderId} not found`);
    if (req.user.role === "dropshipper" && String(localOrder.createdBy) !== String(req.user._id)) {
      throw new AppError(403, "Forbidden");
    }
  }

  const partial = buildReversePayload(body, localOrder);
  if (!partial.warehouse_id) throw new AppError(400, "warehouse_id is required");
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
    localOrder.status = mapVelocityStatus(result.status) || "rto";
    await localOrder.save();
  }

  res.status(201).json({ success: true, data: result });
});

// ─── Reverse order only ───────────────────────────────────

export const createReverseOrderOnly = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as Partial<VelocityReverseOrderRequest>;
  if (!body.warehouse_id) throw new AppError(400, "warehouse_id is required");
  if (!body.order_id) throw new AppError(400, "order_id is required");

  const result = await velocityService.createReverseOrderOnly(body as VelocityReverseOrderRequest);
  res.status(201).json({ success: true, data: result });
});

// ─── Assign AWB to existing reverse order ────────────────

export const createReverseShipmentLater = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { order_id, carrier_id } = req.body as { order_id?: string; carrier_id?: number };
  if (!order_id) throw new AppError(400, "order_id is required");

  const result = await velocityService.createReverseShipmentLater({ order_id, carrier_id });
  res.json({ success: true, data: result });
});

// ─── Cancel ──────────────────────────────────────────────

export const cancelShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { awbs, orderId } = req.body as { awbs?: string[]; orderId?: string };
  if (!awbs?.length) throw new AppError(400, "awbs array is required");

  const result = await velocityService.cancelShipment({ awbs });

  if (orderId && result.success) {
    const localOrder = await Order.findOne({ orderId });
    if (localOrder) {
      if (req.user.role === "dropshipper" && String(localOrder.createdBy) !== String(req.user._id)) {
        throw new AppError(403, "Forbidden");
      }
      localOrder.status = "cancelled";
      localOrder.shipmentStatus = "cancelled";
      await localOrder.save();
    }
  }

  res.json({ success: true, data: result });
});

// ─── Tracking (authenticated) ─────────────────────────────

export const trackShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { awb, orderId } = req.body as { awb?: string; orderId?: string };
  if (!awb) throw new AppError(400, "awb is required");

  const result = await velocityService.trackShipment({ awb });

  const localOrder = await Order.findOne(orderId ? { orderId } : { awb });
  if (localOrder && result.shipment_track_activities?.length) {
    const internalStatus = mapVelocityStatus(result.status);
    localOrder.shipmentStatus = result.status;
    if (internalStatus) localOrder.status = internalStatus;
    localOrder.trackingActivities = result.shipment_track_activities;
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
  const { awb } = req.params as { awb?: string };
  if (!awb) throw new AppError(400, "awb is required");

  const localOrder = await Order.findOne({ $or: [{ awb }, { orderId: awb }] }).lean();
  if (!localOrder) throw new AppError(404, "Order not found");

  const awbToTrack = localOrder.awb || awb;

  if (!awbToTrack) {
    res.json({
      success: true,
      data: {
        awb,
        status: localOrder.status,
        carrierName: localOrder.courierName ?? localOrder.courier,
        activities: localOrder.trackingActivities ?? [],
        order: { id: localOrder.orderId, customer: localOrder.customer },
      },
    });
    return;
  }

  try {
    const result = await velocityService.trackShipment({ awb: awbToTrack });

    await Order.updateOne(
      { _id: localOrder._id },
      {
        shipmentStatus: result.status,
        status: mapVelocityStatus(result.status) || localOrder.status,
        trackingActivities: result.shipment_track_activities,
      }
    );

    res.json({
      success: true,
      data: {
        awb: result.awb,
        status: result.status,
        carrierName: result.carrier_name ?? localOrder.courierName,
        activities: result.shipment_track_activities ?? [],
        order: { id: localOrder.orderId, customer: localOrder.customer },
      },
    });
  } catch {
    res.json({
      success: true,
      data: {
        awb: awbToTrack,
        status: localOrder.shipmentStatus ?? localOrder.status,
        carrierName: localOrder.courierName ?? localOrder.courier,
        activities: localOrder.trackingActivities ?? [],
        order: { id: localOrder.orderId, customer: localOrder.customer },
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

function buildForwardPayload(
  body: Record<string, unknown>,
  localOrder: IOrder | null
): VelocityForwardOrderRequest {
  const products = localOrder?.products as Array<Record<string, unknown>> | undefined;

  return {
    warehouse_id:
      (body.warehouse_id as string) ??
      (localOrder?.velocityWarehouseId ?? ""),
    order_id: (body.order_id as string) ?? (localOrder?.orderId ?? ""),
    payment_mode: ((body.payment_mode as string) ??
      (localOrder?.payment?.toLowerCase() === "cod" ? "cod" : "prepaid")) as "cod" | "prepaid",
    cod_amount:
      (body.cod_amount as number) ??
      (localOrder?.payment?.toLowerCase() === "cod" ? localOrder.amount : undefined),
    order_amount: (body.order_amount as number) ?? (localOrder?.amount ?? 0),
    weight: (body.weight as number) ?? parseFloat(localOrder?.weight ?? "0.5"),
    length: (body.length as number) ?? 10,
    width: (body.width as number) ?? 10,
    height: (body.height as number) ?? 10,
    customer: (body.customer as VelocityForwardOrderRequest["customer"]) ?? {
      name: localOrder?.customer ?? "",
      phone: localOrder?.phone ?? "",
      address: localOrder?.address ?? "",
      city: localOrder?.city ?? "",
      state: localOrder?.state ?? "",
      pincode: localOrder?.pincode ?? "",
    },
    items:
      (body.items as VelocityForwardOrderRequest["items"]) ??
      products?.map((p) => ({
        name: String(p.name ?? "Item"),
        qty: Number(p.qty ?? 1),
        price: Number(p.price ?? 0),
        weight: p.weight ? Number(p.weight) : undefined,
        sku: p.sku ? String(p.sku) : undefined,
      })) ?? [{ name: "Product", qty: 1, price: localOrder?.amount ?? 0 }],
    carrier_id: body.carrier_id as number | undefined,
  };
}

function validateForwardPayload(payload: VelocityForwardOrderRequest) {
  if (!payload.warehouse_id) {
    throw new AppError(
      400,
      "warehouse_id is required — register a warehouse with Velocity first (POST /api/velocity/warehouses)"
    );
  }
  if (!payload.order_id) throw new AppError(400, "order_id is required");
  if (!payload.customer?.name) throw new AppError(400, "customer.name is required");
  if (!payload.customer?.pincode) throw new AppError(400, "customer.pincode is required");
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
