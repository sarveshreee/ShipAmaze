import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IPickup extends Document {
  userId: Types.ObjectId;
  label: string;
  contactName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

const pickupSchema = new Schema<IPickup>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, required: true },
    contactName: { type: String, default: "" },
    phone: { type: String, default: "" },
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Pickup: Model<IPickup> =
  mongoose.models.Pickup || mongoose.model<IPickup>("Pickup", pickupSchema);
