import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IOrder extends Document {
  orderId: string;
  customer: string;
  phone: string;
  address: string;
  city: string;
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
  createdBy: Types.ObjectId;
  vendorId?: Types.ObjectId;
  externalSource?: string;
  externalOrderName?: string;
}

const orderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    customer: { type: String, required: true },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
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
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    externalSource: { type: String },
    externalOrderName: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ awb: 1 });
orderSchema.index({ createdBy: 1 });

export const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>("Order", orderSchema);
