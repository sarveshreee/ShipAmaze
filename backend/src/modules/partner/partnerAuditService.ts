import { PartnerAuditLog } from "../../models/PartnerAuditLog.js";
import type { PartnerAuthRequest } from "./partnerRequestContext.js";

export type PartnerAuditInput = {
  req: PartnerAuthRequest;
  endpoint: string;
  statusCode: number;
  provider?: string;
  orderId?: string;
  partnerReferenceId?: string;
  errorCode?: string;
};

export function recordPartnerAudit(input: PartnerAuditInput): void {
  const partner = input.req.partner;
  if (!partner) return;

  const started = input.req.partnerAuthStartMs ?? Date.now();
  const latencyMs = Date.now() - started;

  void PartnerAuditLog.create({
    partnerId: partner.partnerId,
    apiKeyId: partner.apiKeyId,
    method: input.req.method,
    path: input.req.path,
    endpoint: input.endpoint,
    requestId: partner.requestId,
    correlationId: partner.correlationId,
    statusCode: input.statusCode,
    latencyMs,
    provider: input.provider,
    orderId: input.orderId,
    partnerReferenceId: input.partnerReferenceId,
    errorCode: input.errorCode,
    ip: input.req.ip?.slice(0, 64),
  }).catch(() => undefined);
}
