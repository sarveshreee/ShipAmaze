import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  txnId: string;
  date: string;
  description: string;
  type: "Credit" | "Debit";
  amount: number;
  balance: number;
}

const transactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    txnId: { type: String, required: true },
    date: { type: String, default: "" },
    description: { type: String, default: "" },
    type: { type: String, enum: ["Credit", "Debit"], required: true },
    amount: { type: Number, required: true },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Transaction: Model<ITransaction> =
  mongoose.models.Transaction || mongoose.model<ITransaction>("Transaction", transactionSchema);
