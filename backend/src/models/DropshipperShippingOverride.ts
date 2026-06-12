import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type DropshipperCourierRate = {
  courierName: string;
  carrierId?: string;
  surfaceRate?: number;
  airRate?: number;
  codRate?: number;
  enabled?: boolean;
};

export interface IDropshipperShippingOverride extends Document {
  dropshipperUserId: Types.ObjectId;
  shippingCharge: number;
  surfaceRate?: number;
  airRate?: number;
  courierRates?: DropshipperCourierRate[];
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
    courierRates: [
      {
        courierName: { type: String, required: true },
        carrierId: String,
        surfaceRate: Number,
        airRate: Number,
        codRate: Number,
        enabled: { type: Boolean, default: true },
      },
    ],
    notes: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const DropshipperShippingOverride: Model<IDropshipperShippingOverride> =
  mongoose.models.DropshipperShippingOverride ||
  mongoose.model<IDropshipperShippingOverride>("DropshipperShippingOverride", schema);
