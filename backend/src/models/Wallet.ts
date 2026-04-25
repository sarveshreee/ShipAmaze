import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IWallet extends Document {
  userId: Types.ObjectId;
  balance: number;
  currency: string;
}

const walletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
  },
  { timestamps: true }
);

export const Wallet: Model<IWallet> =
  mongoose.models.Wallet || mongoose.model<IWallet>("Wallet", walletSchema);
