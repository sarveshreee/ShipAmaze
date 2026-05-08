import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type SupportTicketPriority = "low" | "medium" | "high";

export interface ISupportComment {
  userId: Types.ObjectId;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  ticketNumber: string;
  requesterUserId: Types.ObjectId;
  assigneeUserId?: Types.ObjectId | null;
  title: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  comments: ISupportComment[];
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<ISupportComment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true },
    isInternal: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    requesterUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assigneeUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true }
);

supportTicketSchema.index({ createdAt: -1 });

export const SupportTicket: Model<ISupportTicket> =
  mongoose.models.SupportTicket || mongoose.model<ISupportTicket>("SupportTicket", supportTicketSchema);
