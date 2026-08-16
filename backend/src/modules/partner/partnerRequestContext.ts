import type { Request } from "express";
import { randomUUID } from "crypto";
import type { Types } from "mongoose";
import type { PartnerScope } from "./partnerScopes.js";

export type PartnerRequestContext = {
  partnerId: string;
  apiKeyId: string;
  scopes: PartnerScope[];
  linkedUserId: string;
  requestId: string;
  correlationId: string;
};

export interface PartnerAuthRequest extends Request {
  partner?: PartnerRequestContext;
  partnerAuthStartMs?: number;
}

export function ensurePartnerRequestIds(req: PartnerAuthRequest): {
  requestId: string;
  correlationId: string;
} {
  const headerRequestId = String(req.headers["x-request-id"] ?? "").trim();
  const headerCorrelationId = String(req.headers["x-correlation-id"] ?? "").trim();
  const requestId = headerRequestId || randomUUID();
  const correlationId = headerCorrelationId || requestId;
  return { requestId, correlationId };
}

export function attachPartnerContext(
  req: PartnerAuthRequest,
  ctx: Omit<PartnerRequestContext, "requestId" | "correlationId">
): void {
  const ids = ensurePartnerRequestIds(req);
  req.partner = {
    ...ctx,
    requestId: ids.requestId,
    correlationId: ids.correlationId,
  };
}

export function partnerLinkedUserId(req: PartnerAuthRequest): Types.ObjectId | null {
  const id = req.partner?.linkedUserId;
  if (!id) return null;
  return id as unknown as Types.ObjectId;
}
