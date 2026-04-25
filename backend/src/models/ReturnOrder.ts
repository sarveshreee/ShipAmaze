import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IReturnOrder extends Document {
  returnId: string;
  originalOrderId: string;
  awb: string;
  customer: string;
  reason: string;
  courier: string;
  status: string;
  date: string;
  refundAmount: number;
  weight: string;
}

const returnOrderSchema = new Schema<IReturnOrder>(
  {
    returnId: { type: String, required: true, unique: true },
    originalOrderId: { type: String, default: "" },
    awb: { type: String, default: "" },
    customer: { type: String, default: "" },
    reason: { type: String, default: "" },
    courier: { type: String, default: "Delhivery" },
    status: { type: String, default: "Return Requested" },
    date: { type: String, default: "" },
    refundAmount: { type: Number, default: 0 },
    weight: { type: String, default: "" },
  },
  { timestamps: true }
);

export const ReturnOrder: Model<IReturnOrder> =
  mongoose.models.ReturnOrder || mongoose.model<IReturnOrder>("ReturnOrder", returnOrderSchema);
