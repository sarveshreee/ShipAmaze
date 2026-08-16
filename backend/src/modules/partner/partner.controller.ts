import type { Response } from "express";
import { ZodError } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import type { PartnerAuthRequest } from "./partnerRequestContext.js";
import { PARTNER_SCOPES } from "./partnerScopes.js";
import {
  partnerServiceabilitySchema,
  partnerRatesSchema,
  partnerCreateShipmentSchema,
} from "./dto/schemas.js";
import { partnerErrorResponse, partnerSuccessResponse } from "./dto/responses.js";
import { partnerDiscoverRates, partnerDiscoverServiceability } from "./partnerDiscoveryService.js";
import { Partner } from "../../models/Partner.js";
import {
  findPartnerOrderByReference,
  assertPartnerOrderAccess,
} from "./partnerOrderService.js";
import { processPartnerShipmentCreate } from "./partnerShipmentCreateService.js";
import {
  getPartnerShipmentDetails,
  trackPartnerShipment,
} from "./partnerTrackingService.js";
import { cancelPartnerShipment } from "./partnerCancelService.js";
import { recordPartnerAudit } from "./partnerAuditService.js";
import { isPartnerApiEnabled } from "./partnerConfig.js";

function ids(req: PartnerAuthRequest) {
  return {
    requestId: req.partner?.requestId ?? "",
    correlationId: req.partner?.correlationId ?? "",
  };
}

function audit(
  req: PartnerAuthRequest,
  endpoint: string,
  statusCode: number,
  extra?: {
    provider?: string;
    orderId?: string;
    partnerReferenceId?: string;
    errorCode?: string;
  }
) {
  recordPartnerAudit({
    req,
    endpoint,
    statusCode,
    ...extra,
  });
}

function handlePartnerError(req: PartnerAuthRequest, err: unknown, endpoint: string): void {
  const { requestId, correlationId } = ids(req);
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const msg = first?.message || "Validation failed";
    const payload = partnerErrorResponse(
      "VALIDATION_FAILED",
      msg,
      false,
      requestId,
      correlationId
    );
    audit(req, endpoint, 400, { errorCode: "VALIDATION_FAILED" });
    throw Object.assign(new AppError(400, msg), { partnerPayload: payload });
  }
  if (err instanceof AppError) {
    const anyErr = err as AppError & {
      provider?: string;
      code?: string;
      retryable?: boolean;
    };
    const message =
      err.statusCode === 402 ? "Insufficient wallet balance for this shipment" : err.message;
    const payload = partnerErrorResponse(
      anyErr.code ??
        (err.statusCode === 409
          ? "CONFLICT"
          : err.statusCode === 402
            ? "INSUFFICIENT_BALANCE"
            : err.statusCode === 403
              ? "FORBIDDEN"
              : err.statusCode === 404
                ? "NOT_FOUND"
                : err.statusCode === 401
                  ? "UNAUTHORIZED"
                  : err.statusCode === 422
                    ? "UNPROCESSABLE_ENTITY"
                    : "REQUEST_FAILED"),
      message,
      Boolean(anyErr.retryable),
      requestId,
      correlationId,
      anyErr.provider ? { provider: anyErr.provider } : undefined
    );
    audit(req, endpoint, err.statusCode, {
      errorCode: (payload.error as { code?: string })?.code,
      provider: anyErr.provider,
    });
    throw Object.assign(new AppError(err.statusCode, err.message), { partnerPayload: payload });
  }
  audit(req, endpoint, 500, { errorCode: "INTERNAL_ERROR" });
  throw err;
}

export const health = asyncHandler(async (_req, res: Response) => {
  res.json({
    ok: true,
    service: "shipamaze-partner-api",
    version: "v1",
    enabled: isPartnerApiEnabled(),
  });
});

export const serviceability = asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
  const endpoint = "serviceability";
  try {
    const partner = await Partner.findById(req.partner!.partnerId);
    if (!partner) throw new AppError(401, "Invalid or missing API key");

    const parsed = partnerServiceabilitySchema.parse({
      ...req.body,
      fromPincode: String(req.body?.fromPincode ?? req.body?.from ?? "").replace(/\D/g, "").slice(0, 6),
      toPincode: String(req.body?.toPincode ?? req.body?.to ?? "").replace(/\D/g, "").slice(0, 6),
    });

    const result = await partnerDiscoverServiceability(partner, parsed);
    const { requestId, correlationId } = ids(req);
    audit(req, endpoint, 200);
    res.json(partnerSuccessResponse(result, requestId, correlationId));
  } catch (err) {
    handlePartnerError(req, err, endpoint);
  }
});

export const rates = asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
  const endpoint = "rates";
  try {
    const partner = await Partner.findById(req.partner!.partnerId);
    if (!partner) throw new AppError(401, "Invalid or missing API key");

    const parsed = partnerRatesSchema.parse({
      ...req.body,
      fromPincode: String(req.body?.fromPincode ?? req.body?.from ?? "").replace(/\D/g, "").slice(0, 6),
      toPincode: String(req.body?.toPincode ?? req.body?.to ?? "").replace(/\D/g, "").slice(0, 6),
    });

    const result = await partnerDiscoverRates(partner, parsed);
    const { requestId, correlationId } = ids(req);
    audit(req, endpoint, 200);
    res.json(partnerSuccessResponse(result, requestId, correlationId));
  } catch (err) {
    handlePartnerError(req, err, endpoint);
  }
});

export const createShipment = asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
  const endpoint = "shipments.create";
  const { requestId, correlationId } = ids(req);

  const idempotencyKey = String(req.headers["idempotency-key"] ?? "").trim();
  if (!idempotencyKey) {
    audit(req, endpoint, 400, { errorCode: "IDEMPOTENCY_KEY_REQUIRED" });
    res.status(400).json(
      partnerErrorResponse(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required for shipment creation",
        false,
        requestId,
        correlationId
      )
    );
    return;
  }

  try {
    const partner = await Partner.findById(req.partner!.partnerId);
    if (!partner) throw new AppError(401, "Invalid or missing API key");

    const parsed = partnerCreateShipmentSchema.parse(req.body);

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: req.partner!.apiKeyId,
      parsed,
      idempotencyKey,
      requestId,
      correlationId,
    });

    const errorCode = (result.body.error as { code?: string } | undefined)?.code;

    if (result.kind === "success") {
      const data = result.body.data as { shipmentId?: string } | undefined;
      audit(req, endpoint, result.httpStatus, {
        provider: parsed.provider,
        orderId: data?.shipmentId,
        partnerReferenceId: parsed.referenceId,
        errorCode,
      });
      res.status(result.httpStatus).json(result.body);
      return;
    }

    audit(req, endpoint, result.httpStatus, {
      provider: parsed.provider,
      partnerReferenceId: parsed.referenceId,
      errorCode,
    });

    if (result.throwErr) {
      throw result.throwErr;
    }
    res.status(result.httpStatus).json(result.body);
  } catch (err) {
    handlePartnerError(req, err, endpoint);
  }
});

export const getShipment = asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
  const endpoint = "shipments.get";
  try {
    const referenceId = String(req.params.referenceId ?? "").trim();
    if (!referenceId) throw new AppError(400, "referenceId is required");

    const order = await findPartnerOrderByReference(req.partner!.partnerId, referenceId);
    if (!order) throw new AppError(404, "Shipment not found");
    assertPartnerOrderAccess(order, req.partner!.partnerId);

    const details = await getPartnerShipmentDetails(order);
    const { requestId, correlationId } = ids(req);
    audit(req, endpoint, 200, {
      orderId: order.orderId,
      partnerReferenceId: referenceId,
      provider: order.courierProvider,
    });
    res.json(partnerSuccessResponse(details, requestId, correlationId));
  } catch (err) {
    handlePartnerError(req, err, endpoint);
  }
});

export const trackShipment = asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
  const endpoint = "shipments.track";
  try {
    const referenceId = String(req.params.referenceId ?? "").trim();
    const order = await findPartnerOrderByReference(req.partner!.partnerId, referenceId);
    if (!order) throw new AppError(404, "Shipment not found");
    assertPartnerOrderAccess(order, req.partner!.partnerId);

    const tracked = await trackPartnerShipment(order);
    const { requestId, correlationId } = ids(req);
    audit(req, endpoint, 200, {
      orderId: order.orderId,
      partnerReferenceId: referenceId,
      provider: order.courierProvider,
    });
    res.json(partnerSuccessResponse(tracked, requestId, correlationId));
  } catch (err) {
    handlePartnerError(req, err, endpoint);
  }
});

export const cancelShipment = asyncHandler(async (req: PartnerAuthRequest, res: Response) => {
  const endpoint = "shipments.cancel";
  try {
    const referenceId = String(req.params.referenceId ?? "").trim();
    const order = await findPartnerOrderByReference(req.partner!.partnerId, referenceId);
    if (!order) throw new AppError(404, "Shipment not found");
    assertPartnerOrderAccess(order, req.partner!.partnerId);

    const result = await cancelPartnerShipment(order);
    const { requestId, correlationId } = ids(req);
    audit(req, endpoint, 200, {
      orderId: order.orderId,
      partnerReferenceId: referenceId,
      provider: order.courierProvider,
    });
    res.json(partnerSuccessResponse(result, requestId, correlationId));
  } catch (err) {
    handlePartnerError(req, err, endpoint);
  }
});
