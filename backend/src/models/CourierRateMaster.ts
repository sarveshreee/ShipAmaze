import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ICourierWeightSlab {
  weightKg: number;
  weightLabel: string;
  prepaidRate: number;
  codRate?: number;
}

export interface ICourierRateMaster extends Document {
  courierName: string;
  /** Velocity carrier_id when mapped */
  carrierId?: string;
  active: boolean;
  weightSlabs: ICourierWeightSlab[];
  /** Future: margin on top of base rate */
  marginPercent?: number;
  /** Future: override priority for this courier */
  priority?: number;
  /** Future: expected delivery SLA in days */
  slaDays?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const weightSlabSchema = new Schema<ICourierWeightSlab>(
  {
    weightKg: { type: Number, required: true },
    weightLabel: { type: String, required: true },
    prepaidRate: { type: Number, required: true, min: 0 },
    codRate: { type: Number, min: 0 },
  },
  { _id: false }
);

const courierRateMasterSchema = new Schema<ICourierRateMaster>(
  {
    courierName: { type: String, required: true, unique: true, trim: true },
    carrierId: { type: String, default: "" },
    active: { type: Boolean, default: true },
    weightSlabs: { type: [weightSlabSchema], default: [] },
    marginPercent: { type: Number, min: 0 },
    priority: { type: Number, min: 0 },
    slaDays: { type: Number, min: 0 },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

export const DEFAULT_WEIGHT_SLABS: ICourierWeightSlab[] = [
  { weightKg: 0.5, weightLabel: "0.5 kg", prepaidRate: 0, codRate: 0 },
  { weightKg: 1, weightLabel: "1 kg", prepaidRate: 0, codRate: 0 },
  { weightKg: 2, weightLabel: "2 kg", prepaidRate: 0, codRate: 0 },
  { weightKg: 5, weightLabel: "5 kg", prepaidRate: 0, codRate: 0 },
  { weightKg: 10, weightLabel: "10 kg", prepaidRate: 0, codRate: 0 },
];

export const CourierRateMaster: Model<ICourierRateMaster> =
  mongoose.models.CourierRateMaster ||
  mongoose.model<ICourierRateMaster>("CourierRateMaster", courierRateMasterSchema);
