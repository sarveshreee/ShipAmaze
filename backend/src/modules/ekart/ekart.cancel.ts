/**
 * Ekart cancel / RTO / Cancel RVP — Durin Non_Large v2/v3.
 *
 * Forward cancel: PUT /v3/shipments/rto/create (RTO before OFD/delivered).
 * Reverse cancel: PUT /v3/shipments/cancel_rvp.
 *
 * Docs note some v3 paths were historically gated to merchant MYS;
 * ShipAmaze still calls the documented endpoints when cancel is invoked.
 */

import { randomUUID } from "crypto";
import { AppError } from "../../middleware/errorMiddleware.js";
import { sanitizeForProviderLog } from "../courier/http/sanitizeForProviderLog.js";
import type { ProviderCancelInput, ProviderCancelResult } from "../courier/types.js";
import { ekartConfig } from "./ekart.config.js";
import { ekartPut } from "./ekart.client.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function isRejected(raw: unknown): { rejected: boolean; message?: string } {
  const root = asRecord(raw) ?? {};
  const response = Array.isArray(root.response) ? root.response : [];
  const first = asRecord(response[0]) ?? {};
  const status = String(first.status ?? "").toUpperCase();
  const statusCode =
    typeof first.status_code === "number" ? first.status_code : Number(first.status_code);
  const message = Array.isArray(first.message)
    ? first.message.map(String).join("; ")
    : typeof first.message === "string"
      ? first.message
      : undefined;
  const rejected =
    status === "REQUEST_REJECTED" || (Number.isFinite(statusCode) && statusCode >= 400);
  return { rejected, message };
}

/** Flipkart-format tracking id 4th char R ⇒ reverse / RVP. */
export function isEkartReverseTrackingId(trackingId: string): boolean {
  const t = String(trackingId ?? "").trim().toUpperCase();
  return t.length >= 4 && t[3] === "R";
}

export function resolveEkartCancelLeg(
  input: ProviderCancelInput
): "FORWARD" | "REVERSE" {
  const leg = String(input.serviceLeg ?? "").trim().toUpperCase();
  if (leg === "REVERSE") return "REVERSE";
  if (leg === "FORWARD") return "FORWARD";
  const awb = String(input.awbs?.[0] ?? "").trim();
  if (awb && isEkartReverseTrackingId(awb)) return "REVERSE";
  return "FORWARD";
}

/**
 * Cancel forward shipment via Create RTO V3, or reverse via Cancel RVP.
 */
export async function cancelEkartShipment(
  input: ProviderCancelInput
): Promise<ProviderCancelResult> {
  const awb = String(input.awbs?.[0] ?? "").trim();
  const merchantRef = String(
    input.merchantReferenceId ?? input.providerOrderId ?? ""
  ).trim();
  const reason =
    String(input.reason ?? "Client-Cancellation").trim() || "Client-Cancellation";

  if (!awb && !merchantRef) {
    throw new AppError(
      400,
      "Ekart cancel requires tracking_id (AWB) and/or merchant_reference_id"
    );
  }

  const leg = resolveEkartCancelLeg(input);

  if (leg === "REVERSE") {
    // CancelRvpRequest — flat body per OpenAPI schema.
    const body: Record<string, unknown> = {
      request_id: randomUUID(),
      reason,
    };
    if (merchantRef) body.merchant_reference_id = merchantRef;
    if (awb) body.tracking_id = awb;

    const raw = await ekartPut<unknown>(ekartConfig.cancelRvpEndpoint, body, {
      retryable: false,
    });
    const { rejected, message } = isRejected(raw);
    if (rejected) {
      return {
        success: false,
        message: message || "Ekart Cancel RVP rejected",
        raw: sanitizeForProviderLog(raw),
      };
    }
    return {
      success: true,
      message: message || "Ekart RVP cancel accepted",
      raw: sanitizeForProviderLog(raw),
    };
  }

  // RtoRequestV3 — request_details is an array; either tracking_id or merchant_reference_id.
  const detail: Record<string, unknown> = { reason };
  if (awb) detail.tracking_id = awb;
  else detail.merchant_reference_id = merchantRef;

  const body = {
    request_id: randomUUID(),
    request_details: [detail],
  };

  const raw = await ekartPut<unknown>(ekartConfig.rtoCreateEndpoint, body, {
    retryable: false,
  });
  const { rejected, message } = isRejected(raw);
  if (rejected) {
    return {
      success: false,
      message: message || "Ekart RTO create rejected",
      raw: sanitizeForProviderLog(raw),
    };
  }
  return {
    success: true,
    message: message || "Ekart RTO request accepted",
    raw: sanitizeForProviderLog(raw),
  };
}
