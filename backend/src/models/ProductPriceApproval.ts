import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type ProductPriceApprovalStatus = "pending" | "approved" | "rejected";

export interface IProductPriceApproval extends Document {
  productId: Types.ObjectId;
  productName: string;
  productSku?: string;
  previousPrice: number;
  previousSellingPrice: number;
  previousShippingCharge: number;
  pendingPrice: number;
  pendingSellingPrice: number;
  pendingShippingCharge: number;
  status: ProductPriceApprovalStatus;
  reason?: string;
  submittedBy: Types.ObjectId;
  submittedByRole: string;
  submittedByName?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  rejectedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IProductPriceApproval>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productName: { type: String, required: true },
    productSku: String,
    previousPrice: { type: Number, default: 0 },
    previousSellingPrice: { type: Number, default: 0 },
    previousShippingCharge: { type: Number, default: 0 },
    pendingPrice: { type: Number, default: 0 },
    pendingSellingPrice: { type: Number, default: 0 },
    pendingShippingCharge: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reason: String,
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    submittedByRole: { type: String, required: true },
    submittedByName: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    rejectedReason: String,
  },
  { timestamps: true }
);

schema.index({ status: 1, createdAt: -1 });

export const ProductPriceApproval: Model<IProductPriceApproval> =
  mongoose.models.ProductPriceApproval ||
  mongoose.model<IProductPriceApproval>("ProductPriceApproval", schema);
