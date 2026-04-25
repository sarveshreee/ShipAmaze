import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IKycProfile extends Document {
  userId: Types.ObjectId;
  data: Record<string, unknown>;
}

const kycSchema = new Schema<IKycProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const KycProfile: Model<IKycProfile> =
  mongoose.models.KycProfile || mongoose.model<IKycProfile>("KycProfile", kycSchema);
