import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IDropshipper extends Document {
  userId: Types.ObjectId;
  totalOrders: number;
  activeOrders: number;
  kycVerified: boolean;
  joinDate?: Date;
}

const dropshipperSchema = new Schema<IDropshipper>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    totalOrders: { type: Number, default: 0 },
    activeOrders: { type: Number, default: 0 },
    kycVerified: { type: Boolean, default: false },
    joinDate: { type: Date },
  },
  { timestamps: true }
);

export const Dropshipper: Model<IDropshipper> =
  mongoose.models.Dropshipper || mongoose.model<IDropshipper>("Dropshipper", dropshipperSchema);
