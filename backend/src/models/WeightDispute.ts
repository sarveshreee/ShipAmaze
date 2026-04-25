import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IWeightDispute extends Document {
  disputeId: string;
  orderId: string;
  awb: string;
  courier: string;
  sellerWeight: string;
  courierWeight: string;
  diff: string;
  chargedAmount: number;
  expectedAmount: number;
  status: string;
  date: string;
}

const weightDisputeSchema = new Schema<IWeightDispute>(
  {
    disputeId: { type: String, required: true, unique: true },
    orderId: { type: String, default: "" },
    awb: { type: String, default: "" },
    courier: { type: String, default: "Delhivery" },
    sellerWeight: { type: String, default: "" },
    courierWeight: { type: String, default: "" },
    diff: { type: String, default: "" },
    chargedAmount: { type: Number, default: 0 },
    expectedAmount: { type: Number, default: 0 },
    status: { type: String, default: "Open" },
    date: { type: String, default: "" },
  },
  { timestamps: true }
);

export const WeightDispute: Model<IWeightDispute> =
  mongoose.models.WeightDispute || mongoose.model<IWeightDispute>("WeightDispute", weightDisputeSchema);
