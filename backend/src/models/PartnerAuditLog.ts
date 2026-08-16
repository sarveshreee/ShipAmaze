import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IPartnerAuditLog extends Document {
  partnerId: Types.ObjectId;
  apiKeyId?: Types.ObjectId;
  method: string;
  path: string;
  endpoint: string;
  requestId: string;
  correlationId?: string;
  statusCode: number;
  latencyMs: number;
  provider?: string;
  orderId?: string;
  partnerReferenceId?: string;
  errorCode?: string;
  ip?: string;
  createdAt: Date;
}

const partnerAuditLogSchema = new Schema<IPartnerAuditLog>(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: "Partner", required: true, index: true },
    apiKeyId: { type: Schema.Types.ObjectId, ref: "PartnerApiKey", index: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    endpoint: { type: String, required: true, index: true },
    requestId: { type: String, required: true, index: true },
    correlationId: { type: String, index: true },
    statusCode: { type: Number, required: true },
    latencyMs: { type: Number, required: true },
    provider: String,
    orderId: { type: String, index: true },
    partnerReferenceId: String,
    errorCode: String,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

partnerAuditLogSchema.index({ partnerId: 1, createdAt: -1 });

export const PartnerAuditLog: Model<IPartnerAuditLog> =
  mongoose.models.PartnerAuditLog ||
  mongoose.model<IPartnerAuditLog>("PartnerAuditLog", partnerAuditLogSchema);
