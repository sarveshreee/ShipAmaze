import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./authMiddleware.js";
import { AppError } from "./errorMiddleware.js";
import { KycProfile } from "../models/KycProfile.js";
import { Dropshipper } from "../models/Dropshipper.js";

export async function getKycState(userId: unknown): Promise<{
  status: string;
  kycVerified: boolean;
}> {
  const [kyc, dropshipper] = await Promise.all([
    KycProfile.findOne({ userId }).select("status").lean(),
    Dropshipper.findOne({ userId }).select("kycVerified").lean(),
  ]);
  const status = kyc?.status ?? "pending_kyc";
  const kycVerified = dropshipper?.kycVerified === true || status === "approved";
  return { status, kycVerified };
}

/** Blocks dropshippers AND vendors until KYC is admin-approved. Admins/staff pass through. */
export const requireKycApproved = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new AppError(401, "Unauthorized"));
  if (req.user.role !== "dropshipper" && req.user.role !== "vendor") return next();
  const { kycVerified, status } = await getKycState(req.user._id);
  if (kycVerified) return next();
  const msg =
    status === "pending_approval"
      ? "KYC pending admin approval. Actions are disabled until approved."
      : status === "rejected"
        ? "KYC was rejected. Please resubmit your documents in Settings."
        : "Complete KYC verification in Settings before using this feature.";
  return next(new AppError(403, msg));
};
