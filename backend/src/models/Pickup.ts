import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IPickup extends Document {
  userId: Types.ObjectId;
  /** Same as userId when the pickup is for a dropshipper; optional for legacy / alternate writes. */
  dropshipperId?: Types.ObjectId;
  label: string;
  contactName: string;
  phone: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  isActive: boolean;
  /** Velocity dashboard warehouse code after linkOnly (e.g. WHZBRR). */
  velocityWarehouseId?: string;
}

const pickupSchema = new Schema<IPickup>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dropshipperId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    label: { type: String, required: true },
    contactName: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: "India" },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    velocityWarehouseId: { type: String },
  },
  { timestamps: true }
);

export const Pickup: Model<IPickup> =
  mongoose.models.Pickup || mongoose.model<IPickup>("Pickup", pickupSchema);
