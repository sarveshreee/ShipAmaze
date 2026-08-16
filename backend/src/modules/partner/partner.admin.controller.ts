import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { Partner, type IPartner } from "../../models/Partner.js";
import { PartnerApiKey } from "../../models/PartnerApiKey.js";
import { User } from "../../models/User.js";
import { createPartnerApiKey, revokePartnerApiKey } from "./partnerApiKeyService.js";
import { partnerCreateKeySchema, partnerCreatePartnerSchema, partnerUpdateStatusSchema } from "./dto/schemas.js";
import { isPartnerWalletBillingEnabled } from "./partnerConfig.js";

export const adminCreatePartner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = partnerCreatePartnerSchema.parse(req.body);

  if (!mongoose.isValidObjectId(parsed.linkedUserId)) {
    throw new AppError(400, "linkedUserId must be a valid user id");
  }

  const linkedUser = await User.findById(parsed.linkedUserId);
  if (!linkedUser) throw new AppError(404, "Linked user not found");

  if (isPartnerWalletBillingEnabled() && linkedUser.role !== "dropshipper") {
    throw new AppError(
      400,
      "When PARTNER_WALLET_BILLING_ENABLED is true, linkedUserId must be a dropshipper user"
    );
  }

  const partner = await Partner.create({
    name: parsed.name,
    description: parsed.description,
    status: "ACTIVE",
    linkedUserId: linkedUser._id,
    allowedProviders: parsed.allowedProviders,
    allowedPickupIds: parsed.allowedPickupIds?.map((id) => new mongoose.Types.ObjectId(id)),
    createdByAdminId: req.user?._id,
  });

  res.status(201).json({
    success: true,
    data: mapPartnerPublic(partner),
  });
});

export const adminListPartners = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const partners = await Partner.find().sort({ createdAt: -1 }).limit(200).lean();
  const partnerIds = partners.map((p) => p._id);
  const linkedUserIds = [...new Set(partners.map((p) => p.linkedUserId))];

  const users = linkedUserIds.length
    ? await User.find({ _id: { $in: linkedUserIds } })
        .select("name email role")
        .lean()
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const keyCounts =
    partnerIds.length > 0
      ? await PartnerApiKey.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
          { $match: { partnerId: { $in: partnerIds }, status: "ACTIVE" } },
          { $group: { _id: "$partnerId", count: { $sum: 1 } } },
        ])
      : [];
  const activeKeyCountByPartner = new Map(keyCounts.map((r) => [String(r._id), r.count]));

  res.json({
    success: true,
    data: partners.map((p) => {
      const linked = userById.get(String(p.linkedUserId));
      return {
        id: String(p._id),
        name: p.name,
        status: p.status,
        linkedUserId: String(p.linkedUserId),
        allowedProviders: p.allowedProviders,
        createdAt: p.createdAt,
        activeKeyCount: activeKeyCountByPartner.get(String(p._id)) ?? 0,
        linkedUser: linked
          ? {
              id: String(linked._id),
              name: linked.name ?? "",
              email: linked.email ?? "",
              role: linked.role,
            }
          : undefined,
      };
    }),
    meta: {
      walletBillingEnabled: isPartnerWalletBillingEnabled(),
    },
  });
});

export const adminUpdatePartnerStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const partnerId = String(req.params.id ?? "").trim();
  if (!mongoose.isValidObjectId(partnerId)) throw new AppError(400, "Invalid partner id");

  const parsed = partnerUpdateStatusSchema.parse(req.body ?? {});

  const partner = await Partner.findById(partnerId);
  if (!partner) throw new AppError(404, "Partner not found");

  partner.status = parsed.status;
  if (parsed.status === "SUSPENDED" || parsed.status === "DISABLED") {
    partner.suspendedAt = new Date();
    partner.suspendedReason = parsed.reason?.trim() || undefined;
  } else {
    partner.suspendedAt = undefined;
    partner.suspendedReason = undefined;
  }

  await partner.save();

  res.json({
    success: true,
    data: mapPartnerPublic(partner),
  });
});

export const adminCreatePartnerKey = asyncHandler(async (req: AuthRequest, res: Response) => {
  const partnerId = String(req.params.id ?? "").trim();
  if (!mongoose.isValidObjectId(partnerId)) throw new AppError(400, "Invalid partner id");

  const parsed = partnerCreateKeySchema.parse(req.body ?? {});
  const expiresAt = parsed.expiresAt ? new Date(parsed.expiresAt) : undefined;

  const generated = await createPartnerApiKey({
    partnerId: new mongoose.Types.ObjectId(partnerId),
    scopes: parsed.scopes,
    name: parsed.name,
    expiresAt,
  });

  res.status(201).json({
    success: true,
    data: {
      key: generated.rawKey,
      keyPrefix: generated.keyPrefix,
      keyId: String(generated.document._id),
      partnerId,
      scopes: generated.document.scopes,
      warning: "Store this secret now. It will not be shown again.",
    },
  });
});

export const adminRevokePartnerKey = asyncHandler(async (req: AuthRequest, res: Response) => {
  const keyId = String(req.params.keyId ?? "").trim();
  if (!mongoose.isValidObjectId(keyId)) throw new AppError(400, "Invalid key id");

  const revoked = await revokePartnerApiKey(keyId, req.user?._id);
  if (!revoked) throw new AppError(404, "Active API key not found");

  res.json({ success: true, data: { keyId, status: "REVOKED" } });
});

export const adminListPartnerKeys = asyncHandler(async (req: AuthRequest, res: Response) => {
  const partnerId = String(req.params.id ?? "").trim();
  if (!mongoose.isValidObjectId(partnerId)) throw new AppError(400, "Invalid partner id");

  const keys = await PartnerApiKey.find({ partnerId })
    .select("-keyHash")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: keys.map((k) => ({
      id: String(k._id),
      keyPrefix: k.keyPrefix,
      status: k.status,
      scopes: k.scopes,
      name: k.name,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
      revokedAt: k.revokedAt,
    })),
  });
});

function mapPartnerPublic(partner: IPartner) {
  return {
    id: String(partner._id),
    name: partner.name,
    status: partner.status,
    linkedUserId: String(partner.linkedUserId),
    allowedProviders: partner.allowedProviders,
    allowedPickupIds: partner.allowedPickupIds?.map((id) => String(id)),
    createdAt: partner.createdAt,
  };
}
