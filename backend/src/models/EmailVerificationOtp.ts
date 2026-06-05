import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IEmailVerificationOtp extends Document {
  email: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  /** Last time an OTP email was sent — used for resend cooldown. */
  lastSentAt?: Date;
}

const emailVerificationOtpSchema = new Schema<IEmailVerificationOtp>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date },
  },
  { timestamps: true }
);

export const EmailVerificationOtp: Model<IEmailVerificationOtp> =
  mongoose.models.EmailVerificationOtp ||
  mongoose.model<IEmailVerificationOtp>("EmailVerificationOtp", emailVerificationOtpSchema);
