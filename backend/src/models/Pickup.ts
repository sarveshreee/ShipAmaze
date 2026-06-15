import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IPickup extends Document {
  userId: Types.ObjectId;
  /** Same as userId when the pickup is for a dropshipper; optional for legacy / alternate writes. */
  dropshipperId?: Types.ObjectId;
  label: string;
  contactName: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin?: string;
  isDefault: boolean;
  isActive: boolean;
  /** Soft delete — excluded from lists and order selection once set */
  deletedAt?: Date;
  /** Normalized key for duplicate detection per owner */
  addressFingerprint?: string;
  /** Velocity dashboard warehouse code after linkOnly (e.g. WHZBRR). */
  velocityWarehouseId?: string;
  /** Set when this pickup was auto-synced from a vendor/dropshipper Warehouse document. */
  sourceWarehouseId?: Types.ObjectId;
  /** Role of the actor who caused this pickup to be created. */
  createdByRole?: "admin" | "vendor" | "dropshipper";
  /** Vendor ObjectId when createdByRole is vendor or dropshipper. */
  vendorId?: Types.ObjectId;
}

const pickupSchema = new Schema<IPickup>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dropshipperId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    label: { type: String, required: true },
    contactName: { type: String, default: "" },
    phone: { type: String, default: "" },
    alternatePhone: { type: String, default: "" },
    email: { type: String, default: "" },
    addressLine1: { type: String, required: true },
    addressLine2: String,
    landmark: { type: String, default: "" },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: "India" },
    gstin: { type: String, default: "" },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date },
    addressFingerprint: { type: String, index: true },
    velocityWarehouseId: { type: String },
    sourceWarehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", index: true },
    createdByRole: { type: String, enum: ["admin", "vendor", "dropshipper"] },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", index: true },
  },
  { timestamps: true }
);

export const Pickup: Model<IPickup> =
  mongoose.models.Pickup || mongoose.model<IPickup>("Pickup", pickupSchema);
