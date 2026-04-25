import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface INDR extends Document {
  awb: string;
  customer: string;
  seller: string;
  reason: string;
  attempts: number;
  lastUpdate: string;
  status: string;
  phone: string;
  nextAction: string;
}

const ndrSchema = new Schema<INDR>(
  {
    awb: { type: String, required: true, unique: true },
    customer: { type: String, default: "" },
    seller: { type: String, default: "" },
    reason: { type: String, default: "" },
    attempts: { type: Number, default: 1 },
    lastUpdate: { type: String, default: "" },
    status: { type: String, default: "Active" },
    phone: { type: String, default: "" },
    nextAction: { type: String, default: "Re-attempt" },
  },
  { timestamps: true }
);

export const NDR: Model<INDR> = mongoose.models.NDR || mongoose.model<INDR>("NDR", ndrSchema);
