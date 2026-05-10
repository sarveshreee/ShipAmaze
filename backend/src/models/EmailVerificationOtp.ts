import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IEmailVerificationOtp extends Document {
  email: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
}

const emailVerificationOtpSchema = new Schema<IEmailVerificationOtp>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const EmailVerificationOtp: Model<IEmailVerificationOtp> =
  mongoose.models.EmailVerificationOtp ||
  mongoose.model<IEmailVerificationOtp>("EmailVerificationOtp", emailVerificationOtpSchema);
