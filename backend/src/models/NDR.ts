import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface INDR extends Document {
  awb: string;
  customer: string;
  seller: string;
  reason: string;
  attempts: number;
  lastUpdate: string;
  status: string;
  phone: string;
  nextAction: string;
  /** Linked ShipAmaze order id */
  orderId?: string;
  /** Courier name from Velocity */
  carrier?: string;
  /** Raw Velocity shipment status (e.g. ndr_raised) */
  velocityStatus?: string;
  /** Active courier provider for this NDR row. */
  courierProvider?: "velocity" | "lorrigo";
  /** Provider-native status string. */
  providerStatus?: string;
  customerRemarks?: string;
  actionRequired?: boolean;
  recommendedAction?: string;
  /** Fingerprint for duplicate NDR_RECEIVED suppression. */
  lastNdrFingerprint?: string;
  /** Order value / COD amount */
  amount?: number;
  actionStatus?: string;
  actionMessage?: string;
  lastActionAt?: Date;
  actionHistory?: Array<{
    action: string;
    status: string;
    message?: string;
    at: Date;
  }>;
}

const ndrSchema = new Schema<INDR>(
  {
    awb: { type: String, required: true, unique: true },
    customer: { type: String, default: "" },
    seller: { type: String, default: "" },
    reason: { type: String, default: "" },
    attempts: { type: Number, default: 1 },
    lastUpdate: { type: String, default: "" },
    status: { type: String, default: "Active" },
    phone: { type: String, default: "" },
    nextAction: { type: String, default: "Re-attempt" },
    orderId: { type: String, default: "" },
    carrier: { type: String, default: "" },
    velocityStatus: { type: String, default: "" },
    courierProvider: { type: String, enum: ["velocity", "lorrigo"], index: true },
    providerStatus: { type: String, default: "" },
    customerRemarks: { type: String, default: "" },
    actionRequired: { type: Boolean, default: true },
    recommendedAction: { type: String, default: "" },
    lastNdrFingerprint: { type: String, default: "" },
    amount: { type: Number },
    actionStatus: { type: String, default: "" },
    actionMessage: { type: String, default: "" },
    lastActionAt: { type: Date },
    actionHistory: {
      type: [
        {
          action: { type: String, required: true },
          status: { type: String, required: true },
          message: { type: String, default: "" },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

ndrSchema.index({ status: 1, updatedAt: -1 });

export const NDR: Model<INDR> = mongoose.models.NDR || mongoose.model<INDR>("NDR", ndrSchema);
