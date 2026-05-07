import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IWarehouse extends Document {
  vendorId: Types.ObjectId;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  contactName?: string;
  phone?: string;
  isDefault?: boolean;
  /** When false, hidden from vendor lists and should not be used for new admin shipments */
  isActive?: boolean;
  velocityWarehouseId?: string;
}

const warehouseSchema = new Schema<IWarehouse>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    name: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    contactName: String,
    phone: String,
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    velocityWarehouseId: { type: String },
  },
  { timestamps: true }
);

export const Warehouse: Model<IWarehouse> =
  mongoose.models.Warehouse || mongoose.model<IWarehouse>("Warehouse", warehouseSchema);
