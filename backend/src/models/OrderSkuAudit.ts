import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IOrderSkuAudit extends Document {
  orderId: string;
  lineIndex: number;
  oldSku: string;
  newSku: string;
  productName?: string;
  updatedBy: Types.ObjectId;
  updatedByName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const orderSkuAuditSchema = new Schema<IOrderSkuAudit>(
  {
    orderId: { type: String, required: true, index: true },
    lineIndex: { type: Number, required: true, min: 0 },
    oldSku: { type: String, required: true },
    newSku: { type: String, required: true },
    productName: { type: String },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedByName: { type: String },
  },
  { timestamps: true }
);

orderSkuAuditSchema.index({ orderId: 1, createdAt: -1 });

export const OrderSkuAudit: Model<IOrderSkuAudit> =
  mongoose.models.OrderSkuAudit ||
  mongoose.model<IOrderSkuAudit>("OrderSkuAudit", orderSkuAuditSchema);
