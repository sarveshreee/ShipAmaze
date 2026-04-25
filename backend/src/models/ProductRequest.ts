import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IProductRequest extends Document {
  userId: Types.ObjectId;
  role: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const productRequestSchema = new Schema<IProductRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, default: "dropshipper" },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, default: "pending" },
  },
  { timestamps: true }
);

export const ProductRequest: Model<IProductRequest> =
  mongoose.models.ProductRequest || mongoose.model<IProductRequest>("ProductRequest", productRequestSchema);
