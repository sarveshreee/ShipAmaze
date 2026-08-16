import type { Types } from "mongoose";
import { Order, type IOrder } from "../../models/Order.js";
import { User } from "../../models/User.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import type { IPartner } from "../../models/Partner.js";
import type { IPickup } from "../../models/Pickup.js";
import { buildPickupSnapshotFromLean } from "../../utils/pickupSnapshot.js";
import type { PartnerCreateShipmentInput } from "./dto/schemas.js";

export function generatePartnerOrderId(): string {
  return `SP${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createPartnerOrder(opts: {
  partner: IPartner;
  apiKeyId: Types.ObjectId;
  input: PartnerCreateShipmentInput;
  pickup: IPickup;
}): Promise<IOrder> {
  const { partner, input, pickup } = opts;

  const existingRef = await Order.findOne({
    partnerId: partner._id,
    partnerReferenceId: input.referenceId,
  }).select("orderId partnerReferenceId").lean();

  if (existingRef) {
    throw new AppError(409, `referenceId "${input.referenceId}" already exists for this partner`);
  }

  const linkedUser = await User.findById(partner.linkedUserId);
  if (!linkedUser) {
    throw new AppError(400, "Partner linked user not found");
  }

  const orderId = generatePartnerOrderId();
  const paymentLabel = input.paymentMode === "cod" ? "COD" : "Prepaid";
  const codAmount =
    input.paymentMode === "cod"
      ? Number(input.codAmount ?? 0)
      : 0;

  if (input.paymentMode === "cod" && !(codAmount > 0)) {
    throw new AppError(400, "codAmount is required and must be > 0 for COD shipments");
  }

  const lineItems =
    input.items?.map((item) => ({
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      qty: item.quantity,
      price: item.price,
    })) ?? [{ name: "Item", quantity: 1, qty: 1, price: codAmount }];

  const { snapshot, velocityWarehouseId } = buildPickupSnapshotFromLean(
    pickup,
    pickup._id as Types.ObjectId
  );

  const doc = await Order.create({
    orderId,
    customer: input.customer.name,
    phone: input.customer.phone,
    address: input.customer.address,
    city: input.customer.city,
    state: input.customer.state,
    pincode: input.customer.pincode,
    weight: String(input.package.weight),
    length: input.package.length,
    width: input.package.width,
    breadth: input.package.width,
    height: input.package.height,
    courier: input.courierName ?? input.provider,
    courierName: input.courierName,
    payment: paymentLabel,
    status: "ready_to_ship",
    shipmentStatus: "pending",
    date: new Date().toISOString().slice(0, 10),
    awb: "",
    amount: codAmount,
    products: lineItems,
    items: lineItems,
    orderItems: lineItems,
    pickupAddress: snapshot,
    pickupAddressId: pickup._id,
    pickupWarehouseId: String(pickup._id),
    velocityWarehouseId: velocityWarehouseId ?? pickup.velocityWarehouseId,
    createdBy: linkedUser._id,
    ownerUserId: linkedUser._id,
    dropshipperId: linkedUser.role === "dropshipper" ? linkedUser._id : undefined,
    channel: "Partner",
    sourceType: "partner",
    externalSource: "partner",
    externalOrderName: input.referenceId,
    partnerId: partner._id,
    partnerReferenceId: input.referenceId,
    partnerApiKeyId: opts.apiKeyId,
    customerEmail: input.customer.email ?? "",
    customerPhone: input.customer.phone,
    shippingAddress1: input.customer.address,
    shippingPincode: input.customer.pincode,
    shippingCity: input.customer.city,
    shippingState: input.customer.state,
    courierProvider: input.provider,
    courierCompanyId: input.courierId,
  });

  return doc;
}

export async function findPartnerOrderByReference(
  partnerId: Types.ObjectId | string,
  referenceId: string
): Promise<IOrder | null> {
  return Order.findOne({
    partnerId,
    partnerReferenceId: referenceId,
  });
}

export function assertPartnerOrderAccess(order: IOrder, partnerId: string): void {
  if (String(order.partnerId ?? "") !== String(partnerId)) {
    throw new AppError(404, "Shipment not found");
  }
}
