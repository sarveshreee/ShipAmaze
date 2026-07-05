import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type ActivityModule =
  | "auth"
  | "product"
  | "order"
  | "pickup"
  | "warehouse"
  | "courier"
  | "kyc"
  | "wallet"
  | "settings"
  | "support"
  | "shopify";

export interface IUserActivityLog extends Document {
  userId: Types.ObjectId;
  userName: string;
  role: string;
  module: ActivityModule;
  action: string;
  metadata?: Record<string, unknown>;
  browser: string;
  ipAddress: string;
  userAgent?: string;
  createdAt: Date;
}

const userActivityLogSchema = new Schema<IUserActivityLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, required: true },
    role: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed },
    browser: { type: String, default: "" },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userActivityLogSchema.index({ createdAt: -1 });
userActivityLogSchema.index({ module: 1, createdAt: -1 });
userActivityLogSchema.index({ userId: 1, createdAt: -1 });

export const UserActivityLog: Model<IUserActivityLog> =
  mongoose.models.UserActivityLog ||
  mongoose.model<IUserActivityLog>("UserActivityLog", userActivityLogSchema);
