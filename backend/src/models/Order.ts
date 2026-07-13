import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";
import { registerOrderEmailHooks } from "../services/orderTransactionalEmail.js";

export interface ITrackingActivity {
  date: string;
  activity: string;
  location: string;
}

export interface IOrderStatusEvent {
  status: string;
  at: Date;
  updatedBy?: Types.ObjectId;
  note?: string;
}

export interface IOrder extends Document {
  orderId: string;
  customer: string;
  phone: string;
  address: string;
  city: string;
  state?: string;
  pincode: string;
  weight: string;
  length?: number;
  width?: number;
  breadth?: number;
  height?: number;
  courier: string;
  payment: string;
  status: string;
  date: string;
  awb: string;
  amount: number;
  products: unknown[];
  items?: unknown[];
  orderItems?: unknown[];
  shopifyLineItems?: unknown[];
  dimensions?: string;
  zone?: string;
  pickupAddress?: string | {
    id: string;
    label: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    velocityWarehouseId?: string;
  };
  /** Saved pickup address document (Pickup collection). */
  pickupAddressId?: Types.ObjectId;
  /** Alias field used by shipment flow payloads for pickup selection id. */
  pickupWarehouseId?: string;
  createdBy: Types.ObjectId;
  /** Canonical owner id for dropshipper-owned orders (e.g. Shopify imports). */
  ownerUserId?: Types.ObjectId;
  /** Legacy/query helper — same as owner for some imports */
  dropshipperId?: Types.ObjectId;
  vendorId?: Types.ObjectId;
  /** Manual / shopify / etc. */
  sourceType?: string;
  statusHistory?: IOrderStatusEvent[];
  externalSource?: string;
  externalOrderName?: string;
  channel?: string;
  shipmentCreated?: boolean;
  shipmentId?: string;
  trackingId?: string;
  isJunk?: boolean;
  junkedAt?: Date;
  junkReason?: string;
  // Velocity Shipping fields (all optional – never break existing data)
  velocityOrderId?: string;
  velocityShipmentId?: string;
  velocityReturnId?: string;
  /** Numeric legacy couriers or Velocity string carrier codes. */
  courierCompanyId?: number | string;
  courierName?: string;
  labelUrl?: string;
  labelPdfBase64?: string;
  labelPdfContentType?: string;
  labelPdfCachedAt?: Date;
  manifestUrl?: string;
  shippingCharges?: number;
  /** Actual Velocity/courier freight (internal); dropshipper is billed via shippingCharges. */
  velocityFreightCost?: number;
  codCharges?: number;
  rtoCharges?: number;
  shipmentStatus?: string;
  trackingUrl?: string;
  trackingActivities?: ITrackingActivity[];
  velocityWarehouseId?: string;
  assignedDateTime?: Date;
  movedToReadyAt?: Date;
  /** Date the courier actually picked up the parcel (from Velocity tracking API). */
  pickupDate?: Date;
  /** Estimated Delivery Date synced from Velocity tracking (pickup_date + courier transit days). */
  edd?: Date;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress1?: string;
  shippingAddress2?: string;
  shippingPincode?: string;
  shippingCity?: string;
  shippingState?: string;
  /** Shopify Admin REST order id (numeric as string) for webhooks/dedupe */
  shopifyOrderNumericId?: string;
  shopifyShopDomain?: string;
  /** Human-readable Shopify store name (e.g. EZYSALE.SHOP) synced from Shop API */
  shopifyStoreName?: string;
  shopifyFinancialStatus?: string;
  shopifyFulfillmentStatus?: string;
  shopifyNote?: string;
  shopifyTags?: string;
  lastShopifySyncAt?: Date;
  /** Admin-only internal remark shown in orders table. */
  adminRemark?: string;
  /** History of Velocity-sourced failure/cancellation remarks. */
  remarkHistory?: {
    reason: string;
    source: string;
    velocityStatus?: string;
    at: Date;
  }[];
  /** Last successful/attempted Velocity status poll (fair rotation across batches). */
  lastVelocityStatusSyncedAt?: Date;
}

const trackingActivitySchema = new Schema<ITrackingActivity>(
  {
    date: { type: String, default: "" },
    activity: { type: String, default: "" },
    location: { type: String, default: "" },
  },
  { _id: false }
);

const statusHistorySchema = new Schema<IOrderStatusEvent>(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String },
  },
  { _id: false }
);

const remarkHistorySchema = new Schema(
  {
    reason: { type: String, required: true },
    source: { type: String, default: "" },
    velocityStatus: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    customer: { type: String, required: true },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },
    weight: { type: String, default: "" },
    length: { type: Number },
    width: { type: Number },
    breadth: { type: Number },
    height: { type: Number },
    courier: { type: String, default: "Delhivery" },
    payment: { type: String, default: "Prepaid" },
    status: { type: String, default: "pending" },
    date: { type: String, default: "" },
    awb: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    products: { type: [Schema.Types.Mixed], default: [] },
    items: { type: [Schema.Types.Mixed], default: [] },
    orderItems: { type: [Schema.Types.Mixed], default: [] },
    shopifyLineItems: { type: [Schema.Types.Mixed], default: [] },
    dimensions: String,
    zone: String,
    pickupAddress: { type: Schema.Types.Mixed },
    pickupAddressId: { type: Schema.Types.ObjectId, ref: "Pickup" },
    pickupWarehouseId: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },
    dropshipperId: { type: Schema.Types.ObjectId, ref: "User" },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    sourceType: { type: String },
    statusHistory: { type: [statusHistorySchema], default: undefined },
    externalSource: { type: String },
    externalOrderName: { type: String },
    channel: { type: String, default: "Manual" },
    shipmentCreated: { type: Boolean, default: false },
    shipmentId: { type: String },
    trackingId: { type: String },
    isJunk: { type: Boolean, default: false, index: true },
    junkedAt: { type: Date },
    junkReason: { type: String },
    // Velocity Shipping
    velocityOrderId: { type: String, sparse: true },
    velocityShipmentId: { type: String, sparse: true },
    velocityReturnId: { type: String },
    courierCompanyId: { type: Schema.Types.Mixed },
    courierName: { type: String },
    labelUrl: { type: String },
    labelPdfBase64: { type: String },
    labelPdfContentType: { type: String },
    labelPdfCachedAt: { type: Date },
    manifestUrl: { type: String },
    shippingCharges: { type: Number },
    velocityFreightCost: { type: Number },
    codCharges: { type: Number },
    rtoCharges: { type: Number },
    shipmentStatus: { type: String },
    trackingUrl: { type: String },
    trackingActivities: { type: [trackingActivitySchema], default: undefined },
    velocityWarehouseId: { type: String },
    assignedDateTime: { type: Date },
    movedToReadyAt: { type: Date },
    pickupDate: { type: Date },
    edd: { type: Date },
    customerEmail: { type: String },
    customerPhone: { type: String },
    shippingAddress1: { type: String },
    shippingAddress2: { type: String },
    shippingPincode: { type: String },
    shippingCity: { type: String },
    shippingState: { type: String },
    shopifyOrderNumericId: { type: String, index: true, sparse: true },
    shopifyShopDomain: { type: String, index: true, sparse: true },
    shopifyStoreName: { type: String },
    shopifyFinancialStatus: { type: String },
    shopifyFulfillmentStatus: { type: String },
    shopifyNote: { type: String },
    shopifyTags: { type: String },
    adminRemark: { type: String },
    remarkHistory: { type: [remarkHistorySchema], default: [] },
    lastShopifySyncAt: { type: Date },
    lastVelocityStatusSyncedAt: { type: Date, index: true },
  },
  { timestamps: true }
);

orderSchema.index({ awb: 1 });
orderSchema.index({ createdBy: 1 });
orderSchema.index({ ownerUserId: 1 });
orderSchema.index({ shipmentStatus: 1 });
orderSchema.index({ courierName: 1 });
orderSchema.index({ shopifyShopDomain: 1, shopifyOrderNumericId: 1 }, { sparse: true });

registerOrderEmailHooks(orderSchema);

export const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>("Order", orderSchema);
