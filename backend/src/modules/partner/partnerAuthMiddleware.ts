import type { Response, NextFunction } from "express";
import { AppError } from "../../middleware/errorMiddleware.js";
import { verifyPartnerApiKeyAuth, touchPartnerApiKeyUsage } from "./partnerApiKeyService.js";
import {
  attachPartnerContext,
  type PartnerAuthRequest,
  ensurePartnerRequestIds,
} from "./partnerRequestContext.js";
import type { PartnerScope } from "./partnerScopes.js";
import { isPartnerApiEnabled } from "./partnerConfig.js";

const GENERIC_AUTH_ERROR = "Invalid or missing API key";

function extractBearerToken(req: PartnerAuthRequest): string | null {
  const header = String(req.headers.authorization ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function partnerAuthMiddleware(
  req: PartnerAuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!isPartnerApiEnabled()) {
      return next(new AppError(503, "Partner API is disabled"));
    }

    req.partnerAuthStartMs = Date.now();
    const ids = ensurePartnerRequestIds(req);

    const rawKey = extractBearerToken(req);
    if (!rawKey) {
      return next(new AppError(401, GENERIC_AUTH_ERROR));
    }

    const verified = await verifyPartnerApiKeyAuth(rawKey);
    if (!verified) {
      return next(new AppError(401, GENERIC_AUTH_ERROR));
    }

    const { partner, apiKey } = verified;

    attachPartnerContext(req, {
      partnerId: String(partner._id),
      apiKeyId: String(apiKey._id),
      scopes: apiKey.scopes as PartnerScope[],
      linkedUserId: String(partner.linkedUserId),
    });

    req.partner!.requestId = ids.requestId;
    req.partner!.correlationId = ids.correlationId;

    void touchPartnerApiKeyUsage(apiKey._id, req.ip);

    next();
  } catch (err) {
    next(err);
  }
}

export function requirePartnerScope(...requiredScopes: PartnerScope[]) {
  return (req: PartnerAuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.partner) {
      next(new AppError(401, GENERIC_AUTH_ERROR));
      return;
    }
    const has = requiredScopes.some((s) => req.partner!.scopes.includes(s));
    if (!has) {
      next(new AppError(403, "Insufficient scope for this operation"));
      return;
    }
    next();
  };
}
