import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IProfitCalculatorSetting extends Document {
  key: string;
  /** Per RTO order (₹). */
  rtoChargePerOrder: number;
  /** Forward shipping per confirmed shipment (₹). */
  shippingChargePerOrder: number;
}

const profitCalculatorSettingSchema = new Schema<IProfitCalculatorSetting>(
  {
    key: { type: String, default: "global", unique: true, index: true },
    rtoChargePerOrder: { type: Number, default: 0 },
    shippingChargePerOrder: { type: Number, default: 85 },
  },
  { timestamps: true }
);

export const ProfitCalculatorSetting: Model<IProfitCalculatorSetting> =
  mongoose.models.ProfitCalculatorSetting ||
  mongoose.model<IProfitCalculatorSetting>("ProfitCalculatorSetting", profitCalculatorSettingSchema);
