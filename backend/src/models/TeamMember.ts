import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface ITeamMember extends Document {
  ownerUserId: Types.ObjectId;
  email: string;
  role: string;
  invitedAt: Date;
  lastResentAt?: Date;
}

const teamMemberSchema = new Schema<ITeamMember>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true },
    role: { type: String, default: "member" },
    invitedAt: { type: Date, default: Date.now },
    lastResentAt: Date,
  },
  { timestamps: true }
);

export const TeamMember: Model<ITeamMember> =
  mongoose.models.TeamMember || mongoose.model<ITeamMember>("TeamMember", teamMemberSchema);
