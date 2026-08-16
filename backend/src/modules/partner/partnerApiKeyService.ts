import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Types } from "mongoose";
import { PartnerApiKey, type IPartnerApiKey } from "../../models/PartnerApiKey.js";
import { Partner, type IPartner } from "../../models/Partner.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import {
  PARTNER_KEY_PREFIX_LIVE,
  PARTNER_KEY_PREFIX_LENGTH,
  partnerApiKeyPepper,
} from "./partnerConfig.js";
import { ALL_PARTNER_SCOPES, normalizePartnerScopes, type PartnerScope } from "./partnerScopes.js";

export type GeneratedPartnerApiKey = {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
  document: IPartnerApiKey;
};

export function hashPartnerApiKey(rawKey: string): string {
  return createHmac("sha256", partnerApiKeyPepper()).update(rawKey).digest("hex");
}

export function verifyPartnerApiKey(rawKey: string, keyHash: string): boolean {
  const computed = hashPartnerApiKey(rawKey);
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(keyHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateRawPartnerApiKey(): string {
  const secret = randomBytes(32).toString("base64url");
  return `${PARTNER_KEY_PREFIX_LIVE}${secret}`;
}

export function extractKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, PARTNER_KEY_PREFIX_LENGTH);
}

export function isPartnerKeyFormat(rawKey: string): boolean {
  return rawKey.startsWith(PARTNER_KEY_PREFIX_LIVE) && rawKey.length > PARTNER_KEY_PREFIX_LENGTH + 8;
}

export function resolvePartnerApiKeyScopes(scopes?: string[]): PartnerScope[] {
  if (scopes === undefined) {
    return [...ALL_PARTNER_SCOPES];
  }
  if (scopes.length === 0) {
    throw new AppError(400, "scopes must include at least one scope when explicitly provided");
  }
  const normalized = normalizePartnerScopes(scopes);
  if (normalized.length === 0) {
    throw new AppError(
      400,
      "scopes must include at least one valid scope when explicitly provided"
    );
  }
  return normalized;
}

export async function createPartnerApiKey(opts: {
  partnerId: Types.ObjectId;
  scopes?: string[];
  name?: string;
  expiresAt?: Date;
  createdByAdminId?: Types.ObjectId;
}): Promise<GeneratedPartnerApiKey> {
  const partner = await Partner.findById(opts.partnerId);
  if (!partner) throw new AppError(404, "Partner not found");

  const rawKey = generateRawPartnerApiKey();
  const keyPrefix = extractKeyPrefix(rawKey);
  const keyHash = hashPartnerApiKey(rawKey);
  const scopes = resolvePartnerApiKeyScopes(opts.scopes);

  const doc = await PartnerApiKey.create({
    partnerId: opts.partnerId,
    keyPrefix,
    keyHash,
    scopes,
    status: "ACTIVE",
    name: opts.name?.trim() || undefined,
    expiresAt: opts.expiresAt,
  });

  return { rawKey, keyPrefix, keyHash, document: doc };
}

export async function revokePartnerApiKey(
  keyId: Types.ObjectId | string,
  adminId?: Types.ObjectId
): Promise<IPartnerApiKey | null> {
  return PartnerApiKey.findOneAndUpdate(
    { _id: keyId, status: "ACTIVE" },
    {
      $set: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedByAdminId: adminId,
      },
    },
    { new: true }
  );
}

export type VerifiedPartnerAuth = {
  partner: IPartner;
  apiKey: IPartnerApiKey;
};

export async function verifyPartnerApiKeyAuth(rawKey: string): Promise<VerifiedPartnerAuth | null> {
  if (!isPartnerKeyFormat(rawKey)) return null;

  const keyPrefix = extractKeyPrefix(rawKey);
  const candidates = await PartnerApiKey.find({
    keyPrefix,
    status: "ACTIVE",
  }).limit(5);

  if (candidates.length === 0) return null;

  let matched: IPartnerApiKey | null = null;
  for (const candidate of candidates) {
    if (verifyPartnerApiKey(rawKey, candidate.keyHash)) {
      matched = candidate;
      break;
    }
  }
  if (!matched) return null;

  if (matched.expiresAt && matched.expiresAt.getTime() < Date.now()) {
    await PartnerApiKey.updateOne({ _id: matched._id }, { $set: { status: "EXPIRED" } }).catch(
      () => undefined
    );
    return null;
  }

  const partner = await Partner.findById(matched.partnerId);
  if (!partner) return null;
  if (partner.status !== "ACTIVE") return null;

  return { partner, apiKey: matched };
}

export async function touchPartnerApiKeyUsage(
  keyId: Types.ObjectId,
  ip?: string
): Promise<void> {
  await PartnerApiKey.updateOne(
    { _id: keyId },
    { $set: { lastUsedAt: new Date(), ...(ip ? { lastUsedIp: ip.slice(0, 64) } : {}) } }
  ).catch(() => undefined);
}
