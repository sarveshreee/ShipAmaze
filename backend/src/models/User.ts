import mongoose, { Schema, type Document, type Model } from "mongoose";

export type UserRole = "admin" | "vendor" | "dropshipper";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  /**
   * Admin-recoverable copy of the last password set via admin create/reset.
   * Encrypted with ENCRYPTION_SECRET — never returned except to owner admins.
   */
  adminPasswordEncrypted?: string;
  role: UserRole;
  companyName: string;
  phone: string;
  permissions: string[];
  status: "active" | "inactive" | "blocked";
  /** When false, user must verify email before login. Omitted/undefined = legacy verified accounts. */
  emailVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    adminPasswordEncrypted: { type: String, select: false },
    role: { type: String, enum: ["admin", "vendor", "dropshipper"], required: true },
    companyName: { type: String, default: "" },
    phone: { type: String, default: "" },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ["active", "inactive", "blocked"], default: "active" },
    emailVerified: { type: Boolean },
  },
  { timestamps: true }
);

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
