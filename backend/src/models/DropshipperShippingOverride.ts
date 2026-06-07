import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IDropshipperShippingOverride extends Document {
  dropshipperUserId: Types.ObjectId;
  shippingCharge: number;
  surfaceRate?: number;
  airRate?: number;
  notes?: string;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IDropshipperShippingOverride>(
  {
    dropshipperUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    shippingCharge: { type: Number, default: 0 },
    surfaceRate: Number,
    airRate: Number,
    notes: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const DropshipperShippingOverride: Model<IDropshipperShippingOverride> =
  mongoose.models.DropshipperShippingOverride ||
  mongoose.model<IDropshipperShippingOverride>("DropshipperShippingOverride", schema);
