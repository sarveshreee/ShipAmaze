import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IProfile extends Document {
  userId: Types.ObjectId;
  avatarUrl?: string;
  bio?: string;
}

const profileSchema = new Schema<IProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    avatarUrl: { type: String },
    bio: { type: String },
  },
  { timestamps: true }
);

export const Profile: Model<IProfile> =
  mongoose.models.Profile || mongoose.model<IProfile>("Profile", profileSchema);
