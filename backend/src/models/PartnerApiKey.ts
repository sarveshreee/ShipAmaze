import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type PartnerApiKeyStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export interface IPartnerApiKey extends Document {
  partnerId: Types.ObjectId;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  status: PartnerApiKeyStatus;
  name?: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  lastUsedIp?: string;
  revokedAt?: Date;
  revokedByAdminId?: Types.ObjectId;
  rotatedFromKeyId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const partnerApiKeySchema = new Schema<IPartnerApiKey>(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: "Partner", required: true, index: true },
    keyPrefix: { type: String, required: true, index: true },
    keyHash: { type: String, required: true },
    scopes: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED", "EXPIRED"],
      default: "ACTIVE",
      index: true,
    },
    name: { type: String, trim: true },
    expiresAt: { type: Date, index: true },
    lastUsedAt: { type: Date },
    lastUsedIp: { type: String },
    revokedAt: { type: Date },
    revokedByAdminId: { type: Schema.Types.ObjectId, ref: "User" },
    rotatedFromKeyId: { type: Schema.Types.ObjectId, ref: "PartnerApiKey" },
  },
  { timestamps: true }
);

partnerApiKeySchema.index({ partnerId: 1, status: 1 });
partnerApiKeySchema.index({ keyPrefix: 1, status: 1 });

export const PartnerApiKey: Model<IPartnerApiKey> =
  mongoose.models.PartnerApiKey ||
  mongoose.model<IPartnerApiKey>("PartnerApiKey", partnerApiKeySchema);
