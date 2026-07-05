import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface ILoginSession extends Document {
  userId: Types.ObjectId;
  userName: string;
  email: string;
  role: string;
  sessionToken: string;
  loginTime: Date;
  logoutTime?: Date | null;
  lastActiveTime: Date;
  browser: string;
  operatingSystem: string;
  deviceType: string;
  ipAddress: string;
  location?: string;
  userAgent?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const loginSessionSchema = new Schema<ILoginSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, required: true },
    email: { type: String, required: true, index: true },
    role: { type: String, required: true, index: true },
    sessionToken: { type: String, required: true, unique: true, index: true },
    loginTime: { type: Date, required: true, index: true },
    logoutTime: { type: Date, default: null },
    lastActiveTime: { type: Date, required: true, index: true },
    browser: { type: String, default: "" },
    operatingSystem: { type: String, default: "" },
    deviceType: { type: String, default: "unknown" },
    ipAddress: { type: String, default: "", index: true },
    location: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

loginSessionSchema.index({ email: 1, loginTime: -1 });
loginSessionSchema.index({ role: 1, loginTime: -1 });

export const LoginSession: Model<ILoginSession> =
  mongoose.models.LoginSession || mongoose.model<ILoginSession>("LoginSession", loginSessionSchema);
