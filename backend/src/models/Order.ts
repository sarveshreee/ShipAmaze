import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface ITrackingActivity {
  date: string;
  activity: string;
  location: string;
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
  courier: string;
  payment: string;
  status: string;
  date: string;
  awb: string;
  amount: number;
  products: unknown[];
  dimensions?: string;
  zone?: string;
  pickupAddress?: string;
  /** Saved pickup address document (Pickup collection). */
  pickupAddressId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  vendorId?: Types.ObjectId;
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
  manifestUrl?: string;
  shippingCharges?: number;
  codCharges?: number;
  rtoCharges?: number;
  shipmentStatus?: string;
  trackingUrl?: string;
  trackingActivities?: ITrackingActivity[];
  velocityWarehouseId?: string;
  assignedDateTime?: Date;
  movedToReadyAt?: Date;
}

const trackingActivitySchema = new Schema<ITrackingActivity>(
  {
    date: { type: String, default: "" },
    activity: { type: String, default: "" },
    location: { type: String, default: "" },
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
    courier: { type: String, default: "Delhivery" },
    payment: { type: String, default: "Prepaid" },
    status: { type: String, default: "pending" },
    date: { type: String, default: "" },
    awb: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    products: { type: [Schema.Types.Mixed], default: [] },
    dimensions: String,
    zone: String,
    pickupAddress: String,
    pickupAddressId: { type: Schema.Types.ObjectId, ref: "Pickup" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
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
    manifestUrl: { type: String },
    shippingCharges: { type: Number },
    codCharges: { type: Number },
    rtoCharges: { type: Number },
    shipmentStatus: { type: String },
    trackingUrl: { type: String },
    trackingActivities: { type: [trackingActivitySchema], default: undefined },
    velocityWarehouseId: { type: String },
    assignedDateTime: { type: Date },
    movedToReadyAt: { type: Date },
  },
  { timestamps: true }
);

orderSchema.index({ awb: 1 });
orderSchema.index({ createdBy: 1 });
orderSchema.index({ shipmentStatus: 1 });
orderSchema.index({ courierName: 1 });

export const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>("Order", orderSchema);
