import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * Records Shopify webhook delivery ids so retries / multiple app instances stay idempotent.
 * TTL drops rows after `expiresAt` so the collection stays bounded.
 */
export interface IShopifyWebhookReceipt extends Document {
  deliveryId: string;
  topic: string;
  shopDomain: string;
  expiresAt: Date;
}

const TTL_MS = 8 * 24 * 60 * 60 * 1000;

const shopifyWebhookReceiptSchema = new Schema<IShopifyWebhookReceipt>(
  {
    deliveryId: { type: String, required: true, unique: true, index: true },
    topic: { type: String, default: "" },
    shopDomain: { type: String, default: "" },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: false }
);

export const ShopifyWebhookReceipt: Model<IShopifyWebhookReceipt> =
  mongoose.models.ShopifyWebhookReceipt ||
  mongoose.model<IShopifyWebhookReceipt>("ShopifyWebhookReceipt", shopifyWebhookReceiptSchema);

export function defaultWebhookReceiptExpiry(): Date {
  return new Date(Date.now() + TTL_MS);
}
