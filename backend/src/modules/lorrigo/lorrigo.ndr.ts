/**
 * Lorrigo NDR fetch + action — provider-specific mapping only.
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import { sanitizeForProviderLog } from "../courier/http/sanitizeForProviderLog.js";
import type {
  ProviderFetchNdrInput,
  ProviderNdrActionInput,
  ProviderNdrActionResult,
  ProviderNdrRecord,
} from "../courier/types.js";
import { lorrigoGet, lorrigoPost } from "./lorrigo.client.js";
import { recordNdrAction, recordNdrFetch, recordNdrProviderFailure } from "./lorrigo.ndrMetrics.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function extractOrderRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is Record<string, unknown> => Boolean(asRecord(x)));
  }
  const root = asRecord(raw);
  if (!root) return [];
  for (const key of ["data", "orders", "items", "result"]) {
    const v = root[key];
    if (Array.isArray(v)) {
      return v.filter((x): x is Record<string, unknown> => Boolean(asRecord(x)));
    }
    const nested = asRecord(v);
    if (nested) {
      for (const k2 of ["data", "orders", "items"]) {
        const arr = nested[k2];
        if (Array.isArray(arr)) {
          return arr.filter((x): x is Record<string, unknown> => Boolean(asRecord(x)));
        }
      }
    }
  }
  return [];
}

export function mapLorrigoOrderToNdrRecord(row: Record<string, unknown>): ProviderNdrRecord | null {
  const shipment = asRecord(row.shipment) ?? asRecord(row.Shipment) ?? {};
  const delivery = asRecord(row.deliveryDetails) ?? asRecord(row.delivery) ?? {};
  const awb =
    pickString(row, ["awb", "awbNumber", "awb_code", "trackingId", "trackingNumber"]) ??
    pickString(shipment, ["awb", "awbNumber", "trackingId"]);
  if (!awb) return null;

  const reason =
    pickString(row, ["ndrReason", "reason", "failureReason", "undeliveredReason"]) ??
    pickString(shipment, ["ndrReason", "reason"]) ??
    "NDR";
  const providerStatus =
    pickString(row, ["status", "orderStatus", "shipmentStatus"]) ??
    pickString(shipment, ["status"]) ??
    "NDR";
  const customerRemarks = pickString(row, [
    "customerRemarks",
    "customerRemark",
    "remarks",
    "comment",
  ]);

  return {
    provider: "lorrigo",
    awb,
    reason,
    actionRequired: true,
    recommendedAction: "reattempt",
    providerStatus,
    customerRemarks,
    customerName:
      pickString(delivery, ["fullName", "name", "customerName"]) ??
      pickString(row, ["customerName", "customer"]),
    phone:
      pickString(delivery, ["mobileNumber", "phone", "mobile"]) ??
      pickString(row, ["phone", "mobile"]),
    orderId: pickString(row, ["orderId", "order_id", "merchantOrderId"]),
    carrier: pickString(row, ["courierName", "courier_name", "courier"]),
    amount: (() => {
      const n = Number(row.amountToCollect ?? row.subTotal ?? row.amount);
      return Number.isFinite(n) ? n : undefined;
    })(),
    attempts: (() => {
      const n = Number(row.attempts ?? row.ndrAttempts ?? 1);
      return Number.isFinite(n) && n > 0 ? n : 1;
    })(),
    metadata: {
      lorrigoOrderId: pickString(row, ["id", "_id", "orderId"]),
      rawKeys: Object.keys(row).slice(0, 20),
    },
  };
}

export async function fetchLorrigoNdr(input?: ProviderFetchNdrInput): Promise<ProviderNdrRecord[]> {
  const daysBack = input?.daysBack ?? 30;
  const limit = Math.min(100, Math.max(1, input?.limit ?? 50));
  const page = Math.max(1, input?.page ?? 1);
  const to = new Date();
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const from_date = from.toISOString().slice(0, 10);
  const to_date = to.toISOString().slice(0, 10);

  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    status: "NDR",
    from_date,
    to_date,
  });

  try {
    const raw = await lorrigoGet<unknown>(`/v2/orders?${qs.toString()}`);
    const rows = extractOrderRows(raw);
    const out: ProviderNdrRecord[] = [];
    for (const row of rows) {
      const mapped = mapLorrigoOrderToNdrRecord(row);
      if (mapped) out.push(mapped);
    }
    recordNdrFetch(out.length);
    return out;
  } catch (err) {
    recordNdrProviderFailure();
    throw err;
  }
}

function toLorrigoActionType(action: ProviderNdrActionInput["action"]): string {
  if (action === "return") return "return";
  if (action === "fake-attempt") return "fake-attempt";
  return "reattempt";
}

export async function performLorrigoNdrAction(
  input: ProviderNdrActionInput
): Promise<ProviderNdrActionResult> {
  const awb = String(input.awb ?? "").trim();
  if (!awb) throw new AppError(400, "AWB is required for Lorrigo NDR action");

  const started = Date.now();
  const actionType = toLorrigoActionType(input.action);
  const meta = (input.metadata ?? {}) as Record<string, unknown>;
  // Prefer the Lorrigo internal order ID if stored; AWB is the fallback identifier.
  const ndrId = (meta.lorrigoOrderId as string | undefined) || awb;
  const body: Record<string, unknown> = {
    ndrId,
    awb,
    actionType,
    comment: input.remarks ?? "",
    alt_mobile: input.phone ?? "",
    address: (meta.address as string | undefined) ?? "",
    customer_name: (meta.customerName as string | undefined) ?? "",
    nextAttemptDate: input.nextAttemptDate ?? "",
    proof_audio_url: "",
    proof_image_url: "",
  };

  try {
    const raw = await lorrigoPost<unknown>("/v2/ndr/action", body);
    const root = asRecord(raw) ?? {};
    const message =
      pickString(root, ["message", "msg"]) ?? `Lorrigo NDR action ${actionType} submitted`;
    const latency = Date.now() - started;
    const resolved = actionType === "return";
    recordNdrAction({ ok: true, latencyMs: latency, resolved });
    return {
      success: true,
      message,
      providerStatus: actionType,
      raw: sanitizeForProviderLog(raw),
    };
  } catch (err) {
    recordNdrAction({ ok: false, latencyMs: Date.now() - started });
    throw err;
  }
}

/** Actions Lorrigo exposes in Postman. */
export function lorrigoSupportedNdrActions(): Array<"reattempt" | "return" | "fake-attempt"> {
  return ["reattempt", "return", "fake-attempt"];
}
