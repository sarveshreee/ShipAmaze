import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IShopifyStoreConnection extends Document {
  ownerUserId: Types.ObjectId;
  shopDomain: string;
  accessTokenEncrypted: string;
  scope: string;
  installedAt: Date;
  role: "admin" | "vendor" | "dropshipper";
  isActive: boolean;
  lastSyncedAt?: Date;
}

const shopifyStoreSchema = new Schema<IShopifyStoreConnection>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    shopDomain: { type: String, required: true },
    accessTokenEncrypted: { type: String, required: true },
    scope: { type: String, default: "" },
    installedAt: { type: Date, default: Date.now },
    role: { type: String, enum: ["admin", "vendor", "dropshipper"], required: true },
    isActive: { type: Boolean, default: true },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

shopifyStoreSchema.index({ ownerUserId: 1, shopDomain: 1 }, { unique: true });

export const ShopifyStoreConnection: Model<IShopifyStoreConnection> =
  mongoose.models.ShopifyStoreConnection ||
  mongoose.model<IShopifyStoreConnection>("ShopifyStoreConnection", shopifyStoreSchema);
