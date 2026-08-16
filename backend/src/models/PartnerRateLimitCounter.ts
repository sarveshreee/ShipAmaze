import mongoose, { Schema, type Model } from "mongoose";

export interface IPartnerRateLimitCounter {
  _id: string;
  hits: number;
  resetTime: Date;
  expiresAt: Date;
}

const partnerRateLimitCounterSchema = new Schema<IPartnerRateLimitCounter>(
  {
    _id: { type: String, required: true },
    hits: { type: Number, required: true, default: 0 },
    resetTime: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "partner_rate_limit_counters", versionKey: false }
);

partnerRateLimitCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PartnerRateLimitCounter: Model<IPartnerRateLimitCounter> =
  mongoose.models.PartnerRateLimitCounter ||
  mongoose.model<IPartnerRateLimitCounter>(
    "PartnerRateLimitCounter",
    partnerRateLimitCounterSchema
  );
