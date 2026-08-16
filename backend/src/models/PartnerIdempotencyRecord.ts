import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type PartnerIdempotencyStatus = "PENDING" | "COMPLETED" | "FAILED" | "UNCERTAIN";

export interface IPartnerIdempotencyRecord extends Document {
  partnerId: Types.ObjectId;
  idempotencyKey: string;
  requestFingerprint: string;
  status: PartnerIdempotencyStatus;
  httpStatus?: number;
  responseBody?: Record<string, unknown>;
  orderId?: string;
  partnerReferenceId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const partnerIdempotencySchema = new Schema<IPartnerIdempotencyRecord>(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: "Partner", required: true, index: true },
    idempotencyKey: { type: String, required: true },
    requestFingerprint: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "UNCERTAIN"],
      default: "PENDING",
      index: true,
    },
    httpStatus: Number,
    responseBody: { type: Schema.Types.Mixed },
    orderId: String,
    partnerReferenceId: String,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

partnerIdempotencySchema.index({ partnerId: 1, idempotencyKey: 1 }, { unique: true });
partnerIdempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const partnerIdempotencySchemaWithTtl = partnerIdempotencySchema;

export const PartnerIdempotencyRecord: Model<IPartnerIdempotencyRecord> =
  mongoose.models.PartnerIdempotencyRecord ||
  mongoose.model<IPartnerIdempotencyRecord>("PartnerIdempotencyRecord", partnerIdempotencySchemaWithTtl);
