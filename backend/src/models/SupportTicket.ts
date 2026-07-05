import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "waiting_for_user"
  | "resolved"
  | "closed";
export type SupportTicketPriority = "low" | "medium" | "high";
export type SupportTicketCategory =
  | "orders"
  | "courier"
  | "payment"
  | "wallet"
  | "shopify"
  | "api"
  | "pickup"
  | "warehouse"
  | "technical"
  | "others";

export interface ISupportAttachment {
  fileName: string;
  url: string;
  mimeType?: string;
  size?: number;
  uploadedAt: Date;
}

export interface ISupportComment {
  userId: Types.ObjectId;
  body: string;
  isInternal: boolean;
  attachments?: ISupportAttachment[];
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  ticketNumber: string;
  requesterUserId: Types.ObjectId;
  requesterRole?: string;
  assigneeUserId?: Types.ObjectId | null;
  subject: string;
  /** @deprecated use subject — kept for backward compatibility */
  title: string;
  description: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  attachments: ISupportAttachment[];
  comments: ISupportComment[];
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<ISupportAttachment>(
  {
    fileName: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const commentSchema = new Schema<ISupportComment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true },
    isInternal: { type: Boolean, default: false },
    attachments: { type: [attachmentSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    requesterUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requesterRole: { type: String, index: true },
    assigneeUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    subject: { type: String, default: "" },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    category: {
      type: String,
      enum: ["orders", "courier", "payment", "wallet", "shopify", "api", "pickup", "warehouse", "technical", "others"],
      default: "others",
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "waiting_for_user", "resolved", "closed"],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    attachments: { type: [attachmentSchema], default: [] },
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true }
);

supportTicketSchema.index({ createdAt: -1 });
supportTicketSchema.index({ category: 1, status: 1, createdAt: -1 });

export const SUPPORT_TICKET_CATEGORIES: SupportTicketCategory[] = [
  "orders",
  "courier",
  "payment",
  "wallet",
  "shopify",
  "api",
  "pickup",
  "warehouse",
  "technical",
  "others",
];

export const SupportTicket: Model<ISupportTicket> =
  mongoose.models.SupportTicket || mongoose.model<ISupportTicket>("SupportTicket", supportTicketSchema);
