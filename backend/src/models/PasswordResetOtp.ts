import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IPasswordResetOtp extends Document {
  email: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
}

const passwordResetOtpSchema = new Schema<IPasswordResetOtp>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const PasswordResetOtp: Model<IPasswordResetOtp> =
  mongoose.models.PasswordResetOtp || mongoose.model<IPasswordResetOtp>("PasswordResetOtp", passwordResetOtpSchema);
