import mongoose, { Schema, type Document, type Model } from "mongoose";

const courierSvcSchema = new Schema(
  {
    name: String,
    surface: Boolean,
    air: Boolean,
    cod: Boolean,
    estimatedDays: String,
  },
  { _id: false }
);

export interface IPincodeServiceability extends Document {
  pincode: string;
  city: string;
  state: string;
  zone: string;
  couriers: { name: string; surface: boolean; air: boolean; cod: boolean; estimatedDays: string }[];
}

const pincodeSchema = new Schema<IPincodeServiceability>(
  {
    pincode: { type: String, required: true, unique: true, index: true },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zone: { type: String, default: "" },
    couriers: [courierSvcSchema],
  },
  { timestamps: true }
);

export const PincodeServiceability: Model<IPincodeServiceability> =
  mongoose.models.PincodeServiceability ||
  mongoose.model<IPincodeServiceability>("PincodeServiceability", pincodeSchema);
