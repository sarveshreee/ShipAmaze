import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

/**
 * Per-user payout KPI overrides set by admin while impersonating.
 * Null/undefined fields fall back to automatically computed values.
 */
export interface IPayoutSummaryOverride extends Document {
  userId: Types.ObjectId;
  nextCodOn?: string | null;
  pendingCod?: number | null;
  upcomingPayouts?: number | null;
  totalSettled?: number | null;
  pendingSettlement?: number | null;
  last7Days?: number | null;
  last30Days?: number | null;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPayoutSummaryOverride>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    nextCodOn: { type: String, default: null },
    pendingCod: { type: Number, default: null },
    upcomingPayouts: { type: Number, default: null },
    totalSettled: { type: Number, default: null },
    pendingSettlement: { type: Number, default: null },
    last7Days: { type: Number, default: null },
    last30Days: { type: Number, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const PayoutSummaryOverride: Model<IPayoutSummaryOverride> =
  mongoose.models.PayoutSummaryOverride ||
  mongoose.model<IPayoutSummaryOverride>("PayoutSummaryOverride", schema);
