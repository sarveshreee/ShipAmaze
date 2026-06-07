import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IShippingRateCard extends Document {
  paymentType: "COD" | "Prepaid";
  zones: string[];
  weights: string[];
  rates: number[][];
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IShippingRateCard>(
  {
    paymentType: { type: String, enum: ["COD", "Prepaid"], required: true, unique: true },
    zones: { type: [String], default: ["A", "B", "C", "D", "E"] },
    weights: { type: [String], default: ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"] },
    rates: { type: [[Number]], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const ShippingRateCard: Model<IShippingRateCard> =
  mongoose.models.ShippingRateCard ||
  mongoose.model<IShippingRateCard>("ShippingRateCard", schema);

export const DEFAULT_ZONES = ["A", "B", "C", "D", "E"];
export const DEFAULT_WEIGHTS = ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"];

export function defaultRateMatrix(): number[][] {
  return DEFAULT_ZONES.map((_, zi) =>
    DEFAULT_WEIGHTS.map((_, wi) => 30 + zi * 8 + wi * 15)
  );
}
