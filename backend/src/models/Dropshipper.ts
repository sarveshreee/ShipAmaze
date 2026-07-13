import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type DropshipperAccessType = "FULL" | "RESTRICTED";

export interface IDropshipper extends Document {
  userId: Types.ObjectId;
  /** FULL = vendors/warehouses/order processing; RESTRICTED = limited operational access */
  accessType: DropshipperAccessType;
  /** New business toggle: when false, warehouse/vendor management APIs are blocked. */
  allowWarehouseAccess: boolean;
  totalOrders: number;
  activeOrders: number;
  kycVerified: boolean;
  joinDate?: Date;
  /**
   * Optional custom logo for shipping labels (http(s) or data: URL).
   * When set, labels for this dropshipper's orders use this instead of the global default.
   */
  labelLogoUrl?: string;
}

const dropshipperSchema = new Schema<IDropshipper>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    accessType: {
      type: String,
      enum: ["FULL", "RESTRICTED"],
      default: "FULL",
    },
    allowWarehouseAccess: { type: Boolean, default: true },
    totalOrders: { type: Number, default: 0 },
    activeOrders: { type: Number, default: 0 },
    kycVerified: { type: Boolean, default: false },
    joinDate: { type: Date },
    labelLogoUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Dropshipper: Model<IDropshipper> =
  mongoose.models.Dropshipper || mongoose.model<IDropshipper>("Dropshipper", dropshipperSchema);
