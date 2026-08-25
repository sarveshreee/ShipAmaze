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

/** Append-only provider integration timeline (booking, tracking, cancel, …). */
export interface IProviderEvent {
  provider: "velocity" | "lorrigo" | "ekart";
  type: string;
  timestamp: Date;
  status?: "SUCCESS" | "FAILED" | "SKIPPED" | "PENDING";
  durationMs?: number;
  message?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
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
  /** External partner API tenant (sparse — partner-created orders only). */
  partnerId?: Types.ObjectId;
  /** Partner's reference id (e.g. ORDER-10001); unique per partner when set. */
  partnerReferenceId?: string;
  /** Archived partner reference after a failed unbooked attempt (audit trail). */
  partnerReferenceArchived?: string;
  /** API key used when the partner order was created. */
  partnerApiKeyId?: Types.ObjectId;
  channel?: string;
  shipmentCreated?: boolean;
  /** Atomic booking claim — true while a worker is calling the provider. */
  bookingInProgress?: boolean;
  bookingInProgressAt?: Date;
  /** Client/server idempotency key for booking replays. */
  bookingIdempotencyKey?: string;
  shipmentId?: string;
  trackingId?: string;
  isJunk?: boolean;
  junkedAt?: Date;
  junkReason?: string;
  /** Active courier provider for this shipment (optional; default velocity). */
  courierProvider?: "velocity" | "lorrigo" | "ekart";
  /** Lorrigo order / shipment ids after booking (optional). */
  lorrigoOrderId?: string;
  lorrigoShipmentId?: string;
  /**
   * Ekart Durin ids after booking (optional). Keep distinct:
   * - ekartClientReferenceId = request client_reference_id (ShipAmaze merchant ref)
   * - ekartTrackingId / awb = response tracking_id (shipment AWB used for track)
   * - ekartRequestId = response request_id
   */
  ekartClientReferenceId?: string;
  ekartTrackingId?: string;
  ekartRequestId?: string;
  /** Sanitized provider booking response for support / reconciliation. */
  providerBookingRaw?: Record<string, unknown>;
  /** Set when provider booking succeeded but local persistence failed. */
  bookingReconciliationRequired?: boolean;
  bookedAt?: Date;
  /** Correlation id spanning booking → tracking → cancel → NDR → logs. */
  correlationId?: string;
  /** Booking payload schema version at time of book. */
  bookingVersion?: number;
  /** Append-only provider event timeline. */
  providerEvents?: IProviderEvent[];
  /** Last successful/attempted multi-provider status poll (Lorrigo + future). */
  lastProviderStatusSyncedAt?: Date;
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
  /** Canonical payment snapshot (partial-payment apps). */
  amountPaid?: number;
  amountOutstanding?: number;
  /** Courier collectable / COD remainder after partial prepaid. */
  codCollectableAmount?: number;
  paymentNormalizationReason?: string;
  isPartiallyPaid?: boolean;
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
  /** Wallet debit still required after successful provider booking (partner / Lorrigo/Ekart billing). */
  walletDebitPending?: boolean;
  /** When a wallet debit attempt last failed for this shipment. */
  walletDebitFailedAt?: Date;
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

const providerEventSchema = new Schema<IProviderEvent>(
  {
    provider: { type: String, enum: ["velocity", "lorrigo", "ekart"], required: true },
    type: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ["SUCCESS", "FAILED", "SKIPPED", "PENDING"] },
    durationMs: { type: Number },
    message: { type: String },
    correlationId: { type: String },
    metadata: { type: Schema.Types.Mixed },
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
    partnerId: { type: Schema.Types.ObjectId, ref: "Partner", index: true, sparse: true },
    partnerReferenceId: { type: String, sparse: true },
    partnerReferenceArchived: { type: String, sparse: true },
    partnerApiKeyId: { type: Schema.Types.ObjectId, ref: "PartnerApiKey", sparse: true },
    channel: { type: String, default: "Manual" },
    shipmentCreated: { type: Boolean, default: false },
    bookingInProgress: { type: Boolean, default: false, index: true },
    bookingInProgressAt: { type: Date },
    bookingIdempotencyKey: { type: String, sparse: true, index: true },
    shipmentId: { type: String },
    trackingId: { type: String },
    isJunk: { type: Boolean, default: false, index: true },
    junkedAt: { type: Date },
    junkReason: { type: String },
    courierProvider: { type: String, enum: ["velocity", "lorrigo", "ekart"], index: true },
    lorrigoOrderId: { type: String, sparse: true, index: true },
    lorrigoShipmentId: { type: String, sparse: true },
    ekartClientReferenceId: { type: String, sparse: true, index: true },
    ekartTrackingId: { type: String, sparse: true, index: true },
    ekartRequestId: { type: String, sparse: true },
    providerBookingRaw: { type: Schema.Types.Mixed },
    bookingReconciliationRequired: { type: Boolean, default: false, index: true },
    bookedAt: { type: Date },
    correlationId: { type: String, index: true, sparse: true },
    bookingVersion: { type: Number },
    providerEvents: { type: [providerEventSchema], default: undefined },
    lastProviderStatusSyncedAt: { type: Date, index: true },
    // Velocity Shipping
    velocityOrderId: { type: String, sparse: true, index: true },
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
    amountPaid: { type: Number },
    amountOutstanding: { type: Number },
    codCollectableAmount: { type: Number },
    paymentNormalizationReason: { type: String },
    isPartiallyPaid: { type: Boolean, default: false },
    adminRemark: { type: String },
    remarkHistory: { type: [remarkHistorySchema], default: [] },
    lastShopifySyncAt: { type: Date },
    lastVelocityStatusSyncedAt: { type: Date, index: true },
    walletDebitPending: { type: Boolean, default: false, index: true },
    walletDebitFailedAt: { type: Date },
  },
  { timestamps: true }
);

orderSchema.index({ awb: 1 });
orderSchema.index({ createdBy: 1 });
orderSchema.index({ ownerUserId: 1 });
orderSchema.index({ shipmentStatus: 1 });
orderSchema.index({ courierName: 1 });
orderSchema.index({ shopifyShopDomain: 1, shopifyOrderNumericId: 1 }, { sparse: true });
orderSchema.index({ courierProvider: 1, status: 1, lastProviderStatusSyncedAt: 1 });
orderSchema.index({ status: 1, awb: 1, lastVelocityStatusSyncedAt: 1 });
orderSchema.index({ shipmentCreated: 1, bookingInProgress: 1 });
// Performance: list / dashboard / visibility filters
orderSchema.index({ vendorId: 1, createdAt: -1 });
orderSchema.index({ dropshipperId: 1, createdAt: -1 });
orderSchema.index({ trackingId: 1 }, { sparse: true });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ updatedAt: -1 });
orderSchema.index({ payment: 1, status: 1 });
orderSchema.index({ isJunk: 1, status: 1, createdAt: -1 });
orderSchema.index({ pickupAddressId: 1 });
orderSchema.index({ ownerUserId: 1, isJunk: 1, createdAt: -1 });
orderSchema.index({ isJunk: 1, createdAt: -1, _id: -1 });
orderSchema.index({ createdBy: 1, createdAt: -1 });
orderSchema.index({ partnerId: 1, partnerReferenceId: 1 }, { unique: true, sparse: true });
orderSchema.index({ partnerId: 1, createdAt: -1 }, { sparse: true });
orderSchema.index(
  { walletDebitFailedAt: 1, updatedAt: 1 },
  { partialFilterExpression: { walletDebitPending: true } }
);

registerOrderEmailHooks(orderSchema);

export const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>("Order", orderSchema);
