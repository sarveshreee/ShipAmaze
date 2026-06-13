import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

/** Per-user mapping of a ShipAmaze catalogue product to a Shopify product. */
export interface IShopifyProductPush extends Document {
  ownerUserId: Types.ObjectId;
  productId: Types.ObjectId;
  shopDomain: string;
  shopifyProductId: string;
  shopifyVariantId?: string;
  sellingPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IShopifyProductPush>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    shopDomain: { type: String, required: true },
    shopifyProductId: { type: String, required: true },
    shopifyVariantId: { type: String },
    sellingPrice: { type: Number, default: 0 },
  },
  { timestamps: true }
);

schema.index({ ownerUserId: 1, productId: 1, shopDomain: 1 }, { unique: true });

export const ShopifyProductPush: Model<IShopifyProductPush> =
  mongoose.models.ShopifyProductPush ||
  mongoose.model<IShopifyProductPush>("ShopifyProductPush", schema);
