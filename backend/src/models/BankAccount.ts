import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface IBankAccount extends Document {
  userId: Types.ObjectId;
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  isPrimary: boolean;
  status: string;
  verifiedAt?: Date;
}

const bankSchema = new Schema<IBankAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountHolder: { type: String, required: true },
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifsc: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
    status: { type: String, default: "pending" },
    verifiedAt: Date,
  },
  { timestamps: true }
);

export const BankAccount: Model<IBankAccount> =
  mongoose.models.BankAccount || mongoose.model<IBankAccount>("BankAccount", bankSchema);
