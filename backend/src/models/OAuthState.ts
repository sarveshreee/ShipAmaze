import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

/** OAuth CSRF state lifetime — must match Shopify redirect window expectations. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Short-lived Shopify OAuth state (CSRF + per-merchant app credentials).
 * TTL on `expiresAt` removes stale rows automatically.
 */
export interface IOAuthState extends Document {
  state: string;
  ownerUserId: Types.ObjectId;
  shopDomain: string;
  shopifyApiKey: string;
  shopifyApiSecretEncrypted: string;
  expiresAt: Date;
}

const oauthStateSchema = new Schema<IOAuthState>(
  {
    state: { type: String, required: true, unique: true, index: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    shopDomain: { type: String, required: true },
    shopifyApiKey: { type: String, required: true },
    shopifyApiSecretEncrypted: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: false }
);

export const OAuthState: Model<IOAuthState> =
  mongoose.models.OAuthState || mongoose.model<IOAuthState>("OAuthState", oauthStateSchema);

export function defaultOAuthStateExpiry(): Date {
  return new Date(Date.now() + OAUTH_STATE_TTL_MS);
}
