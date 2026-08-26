import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type GstUploadPayment = "COD" | "Prepaid";
export type GstUploadStatus = "Pending" | "Processed" | "Settled" | string;

export interface IGstUploadRecord extends Document {
  userId: Types.ObjectId;
  orderId: string;
  date: string;
  customer: string;
  amount: number;
  gstPct: number;
  gstAmount: number;
  taxableValue: number;
  total: number;
  payment: GstUploadPayment;
  status: GstUploadStatus;
  /** Extra Excel columns kept for reference / future UI. */
  meta?: Record<string, unknown>;
  uploadedBy?: Types.ObjectId;
  sourceFileName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGstUploadRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderId: { type: String, required: true, index: true },
    date: { type: String, default: "" },
    customer: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    gstPct: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    taxableValue: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    payment: { type: String, default: "COD" },
    status: { type: String, default: "Processed" },
    meta: { type: Schema.Types.Mixed },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    sourceFileName: String,
  },
  { timestamps: true }
);

schema.index({ userId: 1, orderId: 1 }, { unique: true });

export const GstUploadRecord: Model<IGstUploadRecord> =
  mongoose.models.GstUploadRecord || mongoose.model<IGstUploadRecord>("GstUploadRecord", schema);
