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
  /** Lorrigo pickup-address id after successful sync. */
  lorrigoPickupId?: string;
  /**
   * Exact facilityName/address/pincode Lorrigo actually stored for lorrigoPickupId (from the
   * create/lookup response). Bookings must reuse these verbatim — recomputing from the local
   * label/address can drift and make Lorrigo's one-click API try to re-create the pickup address,
   * which fails.
   */
  lorrigoFacilityName?: string;
  lorrigoAddress?: string;
  lorrigoCity?: string;
  lorrigoState?: string;
  lorrigoPincode?: string;
  lorrigoPhone?: string;
  /** Optional Ekart pre-registered location_code (future). Booking uses full address when absent. */
  ekartLocationCode?: string;
  /** Lorrigo sync outcome — optional; unset when sync was never attempted. */
  lorrigoSyncStatus?: "SUCCESS" | "FAILED" | "SKIPPED";
  lorrigoLastSyncAt?: Date;
  /** Sanitized provider error when last sync failed. */
  lorrigoSyncError?: string;
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
    lorrigoPickupId: { type: String, sparse: true, index: true },
    lorrigoFacilityName: { type: String },
    lorrigoAddress: { type: String },
    lorrigoCity: { type: String },
    lorrigoState: { type: String },
    lorrigoPincode: { type: String },
    lorrigoPhone: { type: String },
    ekartLocationCode: { type: String, sparse: true },
    lorrigoSyncStatus: { type: String, enum: ["SUCCESS", "FAILED", "SKIPPED"] },
    lorrigoLastSyncAt: { type: Date },
    lorrigoSyncError: { type: String },
    sourceWarehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", index: true },
    createdByRole: { type: String, enum: ["admin", "vendor", "dropshipper"] },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", index: true },
  },
  { timestamps: true }
);

export const Pickup: Model<IPickup> =
  mongoose.models.Pickup || mongoose.model<IPickup>("Pickup", pickupSchema);
