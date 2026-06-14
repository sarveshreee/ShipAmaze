import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";
import type { ICourierZoneRow } from "./ShippingRateCard.js";

export type DropshipperCourierRate = {
  courierName: string;
  carrierId?: string;
  surfaceRate?: number;
  airRate?: number;
  codRate?: number;
  enabled?: boolean;
};

const courierZoneRowSchema = new Schema<ICourierZoneRow>(
  {
    courier: { type: String, required: true },
    zone: { type: String, required: true },
    rates: { type: [Number], default: [] },
    codCharge: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

export interface IDropshipperShippingOverride extends Document {
  dropshipperUserId: Types.ObjectId;
  /** @deprecated legacy flat override */
  shippingCharge: number;
  /** @deprecated legacy flat override */
  surfaceRate?: number;
  /** @deprecated legacy flat override */
  airRate?: number;
  /** @deprecated legacy per-courier surface/air */
  courierRates?: DropshipperCourierRate[];
  /** Per-dropshipper zone matrix — Prepaid */
  prepaidCourierZoneRows?: ICourierZoneRow[];
  /** Per-dropshipper zone matrix — COD */
  codCourierZoneRows?: ICourierZoneRow[];
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
    prepaidCourierZoneRows: { type: [courierZoneRowSchema], default: [] },
    codCourierZoneRows: { type: [courierZoneRowSchema], default: [] },
    notes: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const DropshipperShippingOverride: Model<IDropshipperShippingOverride> =
  mongoose.models.DropshipperShippingOverride ||
  mongoose.model<IDropshipperShippingOverride>("DropshipperShippingOverride", schema);
