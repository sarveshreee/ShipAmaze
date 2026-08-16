import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type PartnerStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";

export interface IPartner extends Document {
  name: string;
  description?: string;
  status: PartnerStatus;
  linkedUserId: Types.ObjectId;
  allowedProviders?: ("velocity" | "lorrigo" | "ekart")[];
  allowedPickupIds?: Types.ObjectId[];
  rateLimit?: {
    requestsPerMinute?: number;
    bookingsPerMinute?: number;
    trackingPerMinute?: number;
  };
  metadata?: Record<string, unknown>;
  createdByAdminId?: Types.ObjectId;
  suspendedAt?: Date;
  suspendedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const partnerSchema = new Schema<IPartner>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "DISABLED"],
      default: "ACTIVE",
      index: true,
    },
    linkedUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    allowedProviders: {
      type: [String],
      enum: ["velocity", "lorrigo", "ekart"],
      default: undefined,
    },
    allowedPickupIds: [{ type: Schema.Types.ObjectId, ref: "Pickup" }],
    rateLimit: {
      requestsPerMinute: Number,
      bookingsPerMinute: Number,
      trackingPerMinute: Number,
    },
    metadata: { type: Schema.Types.Mixed },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "User" },
    suspendedAt: Date,
    suspendedReason: String,
  },
  { timestamps: true }
);

partnerSchema.index({ status: 1, createdAt: -1 });

export const Partner: Model<IPartner> =
  mongoose.models.Partner || mongoose.model<IPartner>("Partner", partnerSchema);
