import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IRoutingSetting extends Document {
  userId: Types.ObjectId;
  preferredVendorId?: Types.ObjectId;
  rules: Record<string, unknown>;
}

const routingSchema = new Schema<IRoutingSetting>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    preferredVendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    rules: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const RoutingSetting: Model<IRoutingSetting> =
  mongoose.models.RoutingSetting || mongoose.model<IRoutingSetting>("RoutingSetting", routingSchema);
