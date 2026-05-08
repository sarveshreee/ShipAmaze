import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type TransactionStatus = "completed" | "pending" | "failed";

export type WalletReferenceType =
  | "recharge"
  | "order"
  | "shipment"
  | "cod"
  | "adjustment"
  | "refund"
  | "manual_test";

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  txnId: string;
  date: string;
  description: string;
  type: "Credit" | "Debit";
  amount: number;
  /** Balance after this transaction (ledger running balance). */
  balance: number;
  balanceBefore?: number;
  status?: TransactionStatus;
  /** Business category for reporting and UI (e.g. manual_credit_request, cod_settlement). */
  ledgerType?: string;
  referenceType?: WalletReferenceType | string;
  referenceId?: string;
  reason?: string;
  createdAt?: Date;
  updatedAt?: Date;
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
    balanceBefore: { type: Number },
    status: {
      type: String,
      enum: ["completed", "pending", "failed"],
      default: "completed",
    },
    ledgerType: { type: String, default: "general" },
    referenceType: { type: String, index: true },
    referenceId: { type: String, index: true },
    reason: { type: String, default: "" },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, createdAt: -1 });

transactionSchema.index(
  { userId: 1, referenceType: 1, referenceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $and: [{ referenceId: { $exists: true } }, { referenceId: { $nin: [null, ""] } }],
    },
  }
);

export const Transaction: Model<ITransaction> =
  mongoose.models.Transaction || mongoose.model<ITransaction>("Transaction", transactionSchema);
