/**
 * Lorrigo one-click shipment booking — provider-specific payload mapping only.
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import { sanitizeForProviderLog } from "../courier/http/sanitizeForProviderLog.js";
import type {
  ProviderCancelInput,
  ProviderCancelResult,
  ProviderCreateShipmentInput,
  ProviderGetShipmentInput,
  ProviderShipmentResult,
  ProviderTrackInput,
  ProviderTrackingResult,
} from "../courier/types.js";
import { lorrigoGet, lorrigoPost } from "./lorrigo.client.js";

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

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function deepFindString(root: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 4 || root == null) return undefined;
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = deepFindString(item, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const obj = asRecord(root);
  if (!obj) return undefined;
  const direct = pickString(obj, keys);
  if (direct) return direct;
  for (const v of Object.values(obj)) {
    const found = deepFindString(v, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** Build Lorrigo one-click body from normalized shipment input. */
export function buildLorrigoOneClickPayload(input: ProviderCreateShipmentInput): Record<string, unknown> {
  const paymentMethod = input.paymentMode === "cod" ? "cod" : "prepaid";
  const amountToCollect =
    input.paymentMode === "cod" ? Number(input.codAmount ?? input.orderAmount ?? 0) : 0;

  const pickupFromExtras = asRecord(input.providerPayload?.pickupAddress);
  const sellerFromExtras = asRecord(input.providerPayload?.sellerDetails);

  const pickupAddress = {
    facilityName: String(pickupFromExtras?.facilityName ?? input.providerPayload?.pickupName ?? "Pickup"),
    contactPersonName: String(
      pickupFromExtras?.contactPersonName ?? input.providerPayload?.contactPerson ?? "Contact"
    ),
    phone: String(pickupFromExtras?.phone ?? input.providerPayload?.pickupPhone ?? ""),
    address: String(pickupFromExtras?.address ?? input.providerPayload?.pickupStreet ?? ""),
    pincode: String(pickupFromExtras?.pincode ?? input.providerPayload?.pickupPincode ?? ""),
    city: String(pickupFromExtras?.city ?? input.providerPayload?.pickupCity ?? ""),
    state: String(pickupFromExtras?.state ?? input.providerPayload?.pickupState ?? ""),
    ...(input.pickupId ? { pickupAddressId: input.pickupId } : {}),
  };

  const sellerDetails = sellerFromExtras ?? {
    name: pickupAddress.facilityName,
    address: pickupAddress.address,
    pincode: pickupAddress.pincode,
    city: pickupAddress.city,
    state: pickupAddress.state,
    contactNumber: pickupAddress.phone,
  };

  return {
    is_schedule_pickup: true,
    courier_id: String(input.courierId ?? ""),
    order: {
      orderId: input.orderId,
      orderChannel: "CUSTOM",
      orderType: "domestic",
      pickupAddress,
      sellerDetails,
      deliveryDetails: {
        fullName: input.customer.name,
        mobileNumber: input.customer.phone,
        completeAddress: input.customer.address,
        pincode: input.customer.pincode,
        city: input.customer.city,
        state: input.customer.state,
        email: input.customer.email ?? "",
      },
      productDetails: {
        products: input.items.map((i) => ({
          name: i.name,
          price: i.price,
          quantity: i.qty,
          taxRate: i.tax ?? 0,
          sku: i.sku ?? "",
        })),
      },
      subTotal: input.orderAmount,
      packageDetails: {
        deadWeight: input.weightKg,
        length: input.lengthCm,
        breadth: input.widthCm,
        height: input.heightCm,
      },
      paymentMethod: { paymentMethod },
      amountToCollect,
      ewaybill: "",
    },
  };
}

/** Lorrigo Mongo/cuid ids look like `cm…`; avoid storing merchant order numbers as providerOrderId. */
function looksLikeLorrigoInternalId(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/^c[a-z0-9]{20,}$/i.test(s)) return true;
  if (/^ls\d+/i.test(s)) return true;
  return s.length >= 20 && /[a-z]/i.test(s) && /\d/.test(s);
}

function pickLorrigoProviderOrderId(data: Record<string, unknown>, raw: unknown): string | undefined {
  const candidates = [
    pickString(data, ["id", "_id", "lorrigoOrderId", "lorrigo_order_id"]),
    pickString(asRecord(data.order) ?? {}, ["id", "_id"]),
    pickString(data, ["orderId", "order_id"]),
    deepFindString(raw, ["lorrigoOrderId", "lorrigo_order_id"]),
    deepFindString(raw, ["id"]),
    deepFindString(raw, ["orderId", "order_id"]),
  ].filter((x): x is string => Boolean(x?.trim()));

  const preferred = candidates.find(looksLikeLorrigoInternalId);
  return preferred ?? candidates[0];
}

export function parseLorrigoShipmentResult(raw: unknown): ProviderShipmentResult {
  const root = asRecord(raw) ?? {};
  const data = asRecord(root.data) ?? asRecord(root.result) ?? root;

  const awb =
    pickString(data, ["awb", "awbNumber", "awb_code", "awbCode", "trackingId", "tracking_id"]) ??
    deepFindString(raw, ["awb", "awbNumber", "awb_code", "awbCode"]);
  const providerOrderId = pickLorrigoProviderOrderId(data, raw);
  const providerShipmentId =
    pickString(data, ["shipmentId", "shipment_id", "shipmentID"]) ??
    deepFindString(raw, ["shipmentId", "shipment_id"]);
  const courierId = pickString(data, ["courierId", "courier_id", "courierID"]);
  const courierName = pickString(data, ["courierName", "courier_name", "courier"]);
  const labelUrl =
    pickString(data, ["labelUrl", "label_url", "label", "shippingLabel"]) ??
    deepFindString(raw, ["labelUrl", "label_url"]);
  const freight =
    pickNumber(data, ["freight", "freightCharge", "shippingCharge", "shipping_charges", "charge"]) ??
    pickNumber(asRecord(data.pricing) ?? {}, ["freight", "total"]);

  if (!awb) {
    throw new AppError(502, "Lorrigo booking succeeded but no AWB was returned");
  }

  return {
    providerOrderId: providerOrderId ?? "",
    providerShipmentId,
    awb,
    courierId,
    courierName,
    labelUrl: labelUrl || undefined,
    freightCharge: freight,
    status: pickString(data, ["status", "shipmentStatus"]) ?? "booked",
    message: pickString(root, ["message"]),
    raw: sanitizeForProviderLog(raw) as Record<string, unknown>,
  };
}

export async function createLorrigoShipment(
  input: ProviderCreateShipmentInput
): Promise<ProviderShipmentResult> {
  if (!String(input.courierId ?? "").trim()) {
    throw new AppError(400, "courierId is required for Lorrigo booking");
  }
  if (!String(input.pickupId ?? "").trim()) {
    throw new AppError(400, "Lorrigo pickup id is required for booking");
  }

  const payload = buildLorrigoOneClickPayload(input);
  console.info(
    `[lorrigo] booking start orderId=${input.orderId} courierId=${input.courierId} pickupId=${input.pickupId}`
  );
  const raw = await lorrigoPost<unknown>("/v2/shipments/one-click", payload);
  const result = parseLorrigoShipmentResult(raw);
  console.info(
    `[lorrigo] booking success orderId=${input.orderId} awb=${result.awb} providerOrderId=${result.providerOrderId}`
  );
  return result;
}

export async function cancelLorrigoShipment(input: ProviderCancelInput): Promise<ProviderCancelResult> {
  const candidates: string[] = [];
  const push = (v?: string) => {
    const s = String(v ?? "").trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };
  push(input.providerOrderId);

  const awb = String(input.awbs?.[0] ?? "").trim();
  if (awb) {
    try {
      const tracked = await trackLorrigoShipment({ awb });
      push(tracked.providerOrderId);
      // Tracking payloads sometimes nest the real Lorrigo order id under raw.data
      const root = asRecord(tracked.raw) ?? {};
      const data = asRecord(root.data) ?? root;
      push(pickLorrigoProviderOrderId(data, tracked.raw));
      push(awb);
    } catch {
      push(awb);
    }
  }

  if (!candidates.length) {
    throw new AppError(400, "Lorrigo cancel requires providerOrderId (or a trackable AWB)");
  }

  const reason = String(input.reason ?? "customer_request").trim() || "customer_request";
  const cancelTypes = ["order", "shipment"] as const;
  let lastErr: unknown;

  for (const orderId of candidates) {
    for (const cancelType of cancelTypes) {
      try {
        const raw = await lorrigoPost<unknown>(
          `/v2/shipments/${encodeURIComponent(orderId)}/cancel`,
          { reason, cancelType }
        );
        console.info(
          `[lorrigo] cancel success id=${orderId} cancelType=${cancelType} awb=${awb || "-"}`
        );
        return {
          success: true,
          message: pickString(asRecord(raw) ?? {}, ["message"]) ?? "Cancelled",
          raw: sanitizeForProviderLog(raw),
        };
      } catch (err) {
        lastErr = err;
        console.warn(
          `[lorrigo] cancel attempt failed id=${orderId} cancelType=${cancelType}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  if (lastErr instanceof AppError) throw lastErr;
  throw new AppError(
    502,
    lastErr instanceof Error ? lastErr.message : "Lorrigo cancel failed for all id/cancelType attempts"
  );
}

export async function trackLorrigoShipment(input: ProviderTrackInput): Promise<ProviderTrackingResult> {
  const awb = String(input.awb ?? "").trim();
  if (!awb) throw new AppError(400, "AWB is required for Lorrigo tracking");
  const raw = await lorrigoGet<unknown>(`/v2/shipments/${encodeURIComponent(awb)}/tracking`);
  const root = asRecord(raw) ?? {};
  const data = asRecord(root.data) ?? root;
  const activitiesRaw = data.activities ?? data.tracking ?? data.scans;
  const activities = Array.isArray(activitiesRaw)
    ? activitiesRaw.map((a) => {
        const row = asRecord(a) ?? {};
        return {
          date: String(row.date ?? row.timestamp ?? row.time ?? ""),
          activity: String(row.activity ?? row.status ?? row.description ?? ""),
          location: String(row.location ?? row.place ?? ""),
        };
      })
    : [];

  return {
    awb,
    status: String(data.status ?? data.currentStatus ?? root.status ?? "unknown"),
    courierName: pickString(data, ["courierName", "courier_name", "courier"]),
    providerOrderId: pickString(data, ["orderId", "order_id"]),
    activities,
    raw: sanitizeForProviderLog(raw),
  };
}

export async function getLorrigoShipment(input: ProviderGetShipmentInput): Promise<ProviderShipmentResult> {
  const awb = String(input.awb ?? "").trim();
  if (!awb) {
    throw new AppError(400, "AWB is required to fetch Lorrigo shipment details");
  }
  const tracked = await trackLorrigoShipment({ awb });
  return {
    providerOrderId: tracked.providerOrderId ?? String(input.providerOrderId ?? ""),
    awb: tracked.awb,
    courierName: tracked.courierName,
    status: tracked.status,
    raw: tracked.raw as Record<string, unknown> | undefined,
  };
}
