import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface ICodRemittance extends Document {
  userId?: Types.ObjectId;
  remittanceId: string;
  dropshipper: string;
  ordersCount: number;
  codAmount: number;
  deductions: number;
  netPayable: number;
  status: string;
  settleDate: string;
  utr?: string;
}

const codSchema = new Schema<ICodRemittance>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    remittanceId: { type: String, required: true, unique: true },
    dropshipper: { type: String, default: "" },
    ordersCount: { type: Number, default: 0 },
    codAmount: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netPayable: { type: Number, default: 0 },
    status: { type: String, default: "Pending" },
    settleDate: { type: String, default: "" },
    utr: String,
  },
  { timestamps: true }
);

export const CodRemittance: Model<ICodRemittance> =
  mongoose.models.CodRemittance || mongoose.model<ICodRemittance>("CodRemittance", codSchema);
