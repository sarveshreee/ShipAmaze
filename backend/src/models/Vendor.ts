import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IVendor extends Document {
  userId: Types.ObjectId;
  ownerUserId?: Types.ObjectId;
  assignedUserIds?: Types.ObjectId[];
  createdByRole?: "admin" | "vendor" | "dropshipper";
  name: string;
  city: string;
  pin: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  assignedVendors: number;
  ordersToday: number;
  status: "Active" | "Inactive";
}

const vendorSchema = new Schema<IVendor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },
    assignedUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdByRole: { type: String, enum: ["admin", "vendor", "dropshipper"] },
    name: { type: String, required: true },
    city: { type: String, default: "" },
    pin: { type: String, default: "" },
    contactPerson: String,
    phone: String,
    email: String,
    assignedVendors: { type: Number, default: 0 },
    ordersToday: { type: Number, default: 0 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

vendorSchema.index({ ownerUserId: 1 });
vendorSchema.index({ status: 1 });

export const Vendor: Model<IVendor> =
  mongoose.models.Vendor || mongoose.model<IVendor>("Vendor", vendorSchema);
