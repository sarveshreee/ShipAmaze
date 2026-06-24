import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IProduct extends Document {
  name: string;
  sku?: string;
  category?: string;
  /** Additional marketplace categories (first entry mirrors `category` for legacy filters). */
  categories?: string[];
  weight?: string;
  price: number;
  sellingPrice?: number;
  shippingCharge?: number;
  ourCommission?: number;
  stock?: number;
  hsn?: string;
  dimensions?: string;
  status: string;
  vendorId?: Types.ObjectId;
  vendorName?: string;
  uploadedBy?: Types.ObjectId;
  uploadedByRole?: string;
  variants?: unknown[];
  images?: string[];
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    sku: String,
    category: String,
    categories: [String],
    weight: String,
    price: { type: Number, default: 0 },
    sellingPrice: Number,
    shippingCharge: { type: Number, default: 0 },
    ourCommission: { type: Number, default: 40, min: 0 },
    stock: { type: Number, default: 0 },
    hsn: String,
    dimensions: String,
    status: { type: String, default: "draft" },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    vendorName: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    uploadedByRole: String,
    variants: [Schema.Types.Mixed],
    images: [String],
  },
  { strict: false, timestamps: true }
);

export const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", productSchema);
