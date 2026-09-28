/**
 * Ekart NDR actions — Durin has no dedicated NDR list/action API.
 * Re-attempt: PUT /v2/shipments/update_shipment RESCHEDULE_DELIVERY_DATE
 * Return: PUT /v3/shipments/rto/create (same path as forward cancel)
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import { sanitizeForProviderLog } from "../courier/http/sanitizeForProviderLog.js";
import type { ProviderNdrActionInput, ProviderNdrActionResult } from "../courier/types.js";
import { ekartConfig } from "./ekart.config.js";
import { ekartPut } from "./ekart.client.js";
import { cancelEkartShipment } from "./ekart.cancel.js";

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
      : typeof root.message === "string"
        ? root.message
        : undefined;
  const rejected =
    status === "REQUEST_REJECTED" || (Number.isFinite(statusCode) && statusCode >= 400);
  return { rejected, message };
}

/** IST calendar date YYYY-MM-DD, offset by whole days from today. */
export function ekartIstYmdPlusDays(days: number, now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return dt.toISOString().slice(0, 10);
}

export function normalizeEkartNdrRescheduleDate(raw?: string): string {
  const s = String(raw ?? "").trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;
  const dmy = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(parsed));
  }
  return ekartIstYmdPlusDays(1);
}

function merchantRefFromInput(input: ProviderNdrActionInput): string {
  const direct = String(input.merchantReferenceId ?? "").trim();
  if (direct) return direct;
  const meta = input.metadata?.merchantReferenceId;
  return typeof meta === "string" ? meta.trim() : "";
}

/** Durin UpdateShipmentRequest: tracking_id / merchant_reference_id are root fields. */
export function buildEkartNdrRescheduleBody(
  input: { awb?: string; merchantReferenceId?: string; updatedDeliveryDate: string }
): Record<string, unknown> {
  const awb = String(input.awb ?? "").trim();
  const merchantRef = String(input.merchantReferenceId ?? "").trim();
  const body: Record<string, unknown> = {
    update_request_type: "RESCHEDULE_DELIVERY_DATE",
    update_request_details: {
      updated_delivery_date: input.updatedDeliveryDate,
    },
  };
  if (awb) body.tracking_id = awb;
  if (merchantRef) body.merchant_reference_id = merchantRef;
  return body;
}

export async function performEkartNdrAction(
  input: ProviderNdrActionInput
): Promise<ProviderNdrActionResult> {
  const awb = String(input.awb ?? "").trim();
  const merchantRef = merchantRefFromInput(input);
  if (!awb && !merchantRef) {
    throw new AppError(400, "AWB or merchant reference is required for Ekart NDR action");
  }
  if (input.action === "fake-attempt") {
    throw new AppError(400, "Ekart does not support fake-attempt NDR actions");
  }

  if (input.action === "return") {
    const result = await cancelEkartShipment({
      awbs: awb ? [awb] : [],
      merchantReferenceId: merchantRef || undefined,
      reason: String(input.remarks ?? "").trim() || "NDR return to origin",
      serviceLeg: "FORWARD",
    });
    return {
      success: result.success,
      message: result.message || "Ekart NDR return (RTO) submitted",
      providerStatus: result.success ? "rto_initiated" : "rto_rejected",
      raw: result.raw,
    };
  }

  const updatedDeliveryDate = normalizeEkartNdrRescheduleDate(input.nextAttemptDate);
  const body = buildEkartNdrRescheduleBody({
    awb,
    merchantReferenceId: merchantRef,
    updatedDeliveryDate,
  });

  const raw = await ekartPut<unknown>(ekartConfig.updateShipmentEndpoint, body, {
    retryable: false,
  });
  const { rejected, message } = isRejected(raw);
  if (rejected) {
    return {
      success: false,
      message: message || "Ekart NDR reschedule rejected",
      providerStatus: "reattempt_rejected",
      raw: sanitizeForProviderLog(raw),
    };
  }
  return {
    success: true,
    message: message || `Ekart re-attempt requested for ${updatedDeliveryDate}`,
    providerStatus: "reattempt_delivery",
    raw: sanitizeForProviderLog(raw),
  };
}
