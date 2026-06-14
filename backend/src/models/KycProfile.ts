import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type KycStatus = "pending_kyc" | "pending_approval" | "approved" | "rejected";

export type KycAccountType = "individual" | "company";

export interface IKycDocuments {
  pan?: string;
  /** @deprecated legacy single-sided upload */
  aadhaar?: string;
  aadhaarFront?: string;
  aadhaarBack?: string;
  gst?: string;
  cin?: string;
  reg?: string;
  auth_id?: string;
}

export interface IKycProfile extends Document {
  userId: Types.ObjectId;
  status: KycStatus;
  accountType: KycAccountType;
  businessName?: string;
  fullName?: string;
  dob?: string;
  gstNumber?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  cinNumber?: string;
  authorizedPersonName?: string;
  authorizedPersonPan?: string;
  address?: string;
  documents: IKycDocuments;
  termsAcceptedAt?: Date;
  termsVersion?: string;
  rejectionRemark?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  /** Legacy unstructured payload (merged on read for older clients). */
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const documentsSchema = new Schema<IKycDocuments>(
  {
    pan: String,
    aadhaar: String,
    aadhaarFront: String,
    aadhaarBack: String,
    gst: String,
    cin: String,
    reg: String,
    auth_id: String,
  },
  { _id: false }
);

const kycSchema = new Schema<IKycProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    status: {
      type: String,
      enum: ["pending_kyc", "pending_approval", "approved", "rejected"],
      default: "pending_kyc",
    },
    accountType: { type: String, enum: ["individual", "company"], default: "individual" },
    businessName: String,
    fullName: String,
    dob: String,
    gstNumber: String,
    panNumber: String,
    aadhaarNumber: String,
    cinNumber: String,
    authorizedPersonName: String,
    authorizedPersonPan: String,
    address: String,
    documents: { type: documentsSchema, default: {} },
    termsAcceptedAt: Date,
    termsVersion: String,
    rejectionRemark: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const KycProfile: Model<IKycProfile> =
  mongoose.models.KycProfile || mongoose.model<IKycProfile>("KycProfile", kycSchema);

/** Map backend status to legacy frontend status strings. */
export function kycStatusToLegacy(status: KycStatus): "draft" | "pending" | "verified" | "rejected" {
  switch (status) {
    case "pending_approval":
      return "pending";
    case "approved":
      return "verified";
    case "rejected":
      return "rejected";
    default:
      return "draft";
  }
}

export function legacyStatusToKyc(status: unknown): KycStatus | undefined {
  const s = String(status ?? "").toLowerCase();
  if (s === "pending" || s === "pending_approval") return "pending_approval";
  if (s === "verified" || s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "draft" || s === "pending_kyc") return "pending_kyc";
  return undefined;
}
