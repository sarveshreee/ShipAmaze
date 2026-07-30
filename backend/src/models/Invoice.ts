import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IInvoice extends Document {
  userId?: Types.ObjectId;
  invoiceId: string;
  date: string;
  period: string;
  ordersCount: number;
  shippingCharges: number;
  codCharges: number;
  gst: number;
  total: number;
  status: string;
  downloadUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    invoiceId: { type: String, required: true, unique: true },
    date: { type: String, default: "" },
    period: { type: String, default: "" },
    ordersCount: { type: Number, default: 0 },
    shippingCharges: { type: Number, default: 0 },
    codCharges: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    status: { type: String, default: "Unpaid" },
    downloadUrl: String,
  },
  { timestamps: true }
);

invoiceSchema.index({ userId: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, createdAt: -1 });

export const Invoice: Model<IInvoice> =
  mongoose.models.Invoice || mongoose.model<IInvoice>("Invoice", invoiceSchema);
