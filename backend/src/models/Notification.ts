import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type NotificationType =
  | "order_created"
  | "shipment_created"
  | "shopify_sync"
  | "wallet_recharge"
  | "support_update"
  | "approval_pending"
  | "approval_decision"
  | "kyc_update"
  | "user_signup";

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["order_created", "shipment_created", "shopify_sync", "wallet_recharge", "support_update", "approval_pending", "approval_decision", "kyc_update", "user_signup"],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    read: { type: Boolean, default: false, index: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>("Notification", notificationSchema);
