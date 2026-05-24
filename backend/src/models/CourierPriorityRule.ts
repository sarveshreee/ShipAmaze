import mongoose, { Schema, type Document, type Model } from "mongoose";

export type CourierPriorityRuleType =
  | "sku"
  | "weight"
  | "productName"
  | "sellerId"
  | "vendorId";

export interface ICourierPriorityEntry {
  courierName: string;
  courierId?: string;
  rank: number;
}

export interface ICourierPriorityRule extends Document {
  ruleType: CourierPriorityRuleType;
  /** SKU, weight band (e.g. "0-1", ">5"), product name, seller user id, vendor id */
  matchValue: string;
  matchValueSecondary?: string;
  priorities: ICourierPriorityEntry[];
  enabled: boolean;
  sortOrder: number;
  note?: string;
}

const priorityEntrySchema = new Schema<ICourierPriorityEntry>(
  {
    courierName: { type: String, required: true },
    courierId: { type: String },
    rank: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const courierPriorityRuleSchema = new Schema<ICourierPriorityRule>(
  {
    ruleType: {
      type: String,
      enum: ["sku", "weight", "productName", "sellerId", "vendorId"],
      required: true,
      index: true,
    },
    matchValue: { type: String, required: true, trim: true },
    matchValueSecondary: { type: String, trim: true },
    priorities: { type: [priorityEntrySchema], default: [] },
    enabled: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
    note: { type: String },
  },
  { timestamps: true }
);

courierPriorityRuleSchema.index({ ruleType: 1, matchValue: 1 });

export const CourierPriorityRule: Model<ICourierPriorityRule> =
  mongoose.models.CourierPriorityRule ||
  mongoose.model<ICourierPriorityRule>("CourierPriorityRule", courierPriorityRuleSchema);
