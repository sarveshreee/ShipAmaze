import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type ShippingRateApprovalStatus = "pending" | "approved" | "rejected";

export type ShippingRateApprovalType = "courier" | "rate_card" | "dropshipper_override";

export interface IShippingRateApproval extends Document {
  type: ShippingRateApprovalType;
  courierName?: string;
  dropshipperUserId?: Types.ObjectId;
  previousValues: Record<string, unknown>;
  pendingValues: Record<string, unknown>;
  status: ShippingRateApprovalStatus;
  submittedBy: Types.ObjectId;
  submittedByRole: string;
  submittedByName?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  rejectedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IShippingRateApproval>(
  {
    type: {
      type: String,
      enum: ["courier", "rate_card", "dropshipper_override"],
      required: true,
    },
    courierName: String,
    dropshipperUserId: { type: Schema.Types.ObjectId, ref: "User" },
    previousValues: { type: Schema.Types.Mixed, default: {} },
    pendingValues: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    submittedByRole: { type: String, required: true },
    submittedByName: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    rejectedReason: String,
  },
  { timestamps: true }
);

schema.index({ status: 1, createdAt: -1 });

export const ShippingRateApproval: Model<IShippingRateApproval> =
  mongoose.models.ShippingRateApproval ||
  mongoose.model<IShippingRateApproval>("ShippingRateApproval", schema);
