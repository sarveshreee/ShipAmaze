/**
 * Lorrigo serviceability / courier discovery — provider-specific mapping only.
 * Shared aggregation lives in modules/courier/discoverCouriers.ts.
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import {
  finalizeCourierOption,
  parseEstimatedDays,
  pickBool,
  pickNumber,
  pickString,
} from "../courier/normalizeCourierOption.js";
import type { ProviderCourierOption, ProviderServiceabilityInput } from "../courier/types.js";
import { lorrigoPost } from "./lorrigo.client.js";

/** Lorrigo Postman sample: paymentType 0 + empty collectableAmount → prepaid. */
function toLorrigoPaymentType(mode: "cod" | "prepaid"): number {
  return mode === "cod" ? 1 : 0;
}

export function buildLorrigoServiceabilityPayload(input: ProviderServiceabilityInput): Record<string, unknown> {
  const weightKg = input.weightKg != null && input.weightKg > 0 ? input.weightKg : 0.5;
  const length = input.lengthCm != null && input.lengthCm > 0 ? input.lengthCm : 10;
  const width = input.widthCm != null && input.widthCm > 0 ? input.widthCm : 10;
  const height = input.heightCm != null && input.heightCm > 0 ? input.heightCm : 10;
  const paymentType = toLorrigoPaymentType(input.paymentMode);
  const collectable =
    input.paymentMode === "cod"
      ? String(input.collectableAmount != null && input.collectableAmount > 0 ? input.collectableAmount : "")
      : "";

  return {
    pickupPincode: input.fromPincode,
    deliveryPincode: input.toPincode,
    weight: String(weightKg),
    weightUnit: "kg",
    boxLength: length,
    boxWidth: width,
    boxHeight: height,
    sizeUnit: "cm",
    paymentType,
    collectableAmount: collectable,
    isReversedOrder: input.shipmentType === "return",
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Extract courier array from varied Lorrigo response envelopes. */
export function extractLorrigoCourierRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is Record<string, unknown> => Boolean(asRecord(x)));
  }
  const root = asRecord(raw);
  if (!root) return [];

  const candidates: unknown[] = [
    root.data,
    root.couriers,
    root.serviceableCouriers,
    root.serviceable_couriers,
    root.result,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.filter((x): x is Record<string, unknown> => Boolean(asRecord(x)));
    }
    const nested = asRecord(c);
    if (nested) {
      for (const key of ["data", "couriers", "serviceableCouriers", "serviceable_couriers", "items"]) {
        const arr = nested[key];
        if (Array.isArray(arr)) {
          return arr.filter((x): x is Record<string, unknown> => Boolean(asRecord(x)));
        }
      }
    }
  }
  return [];
}

export function mapLorrigoCourierRow(row: Record<string, unknown>): ProviderCourierOption | null {
  const nestedCourier = asRecord(row.courier) ?? asRecord(row.Courier);
  const source = nestedCourier ? { ...nestedCourier, ...row } : row;

  const courierId = pickString(source, [
    "courierId",
    "courier_id",
    "id",
    "_id",
    "courierID",
  ]);
  const courierName = pickString(source, [
    "courierName",
    "courier_name",
    "name",
    "displayName",
    "title",
  ]);
  if (!courierId || !courierName) return null;

  const freight = pickNumber(source, [
    "freight",
    "freightCharge",
    "freight_charge",
    "shippingCharge",
    "shipping_charge",
    "charge",
    "rate",
    "price",
    "totalCharge",
    "total_charge",
    "amount",
  ]);
  const tat = pickString(source, ["tat", "eta", "edd", "expectedDelivery", "deliveryTAT"]);
  const estimatedDays =
    pickNumber(source, ["estimatedDays", "estimated_days", "deliveryDays", "tatDays"]) ??
    parseEstimatedDays(tat);

  const codSupported = pickBool(source, [
    "codSupported",
    "cod",
    "isCod",
    "codAvailable",
    "is_cod",
  ]);
  const pickupAvailable = pickBool(source, [
    "pickupAvailable",
    "pickup",
    "isPickupAvailable",
    "pickup_available",
  ]);
  const serviceable = pickBool(source, ["serviceable", "isServiceable", "is_serviceable"]) ?? true;

  return finalizeCourierOption({
    courierId,
    courierName,
    provider: "lorrigo",
    serviceable,
    estimatedDays,
    freight,
    freightCharge: freight,
    totalCharge: freight,
    codSupported,
    cod: codSupported,
    pickupAvailable,
    tat,
    zone: pickString(source, ["zone", "Zone"]),
    metadata: {
      source: "lorrigo",
      rawKeys: Object.keys(row).slice(0, 24),
    },
  });
}

export function normalizeLorrigoServiceabilityResponse(raw: unknown): ProviderCourierOption[] {
  const rows = extractLorrigoCourierRows(raw);
  const out: ProviderCourierOption[] = [];
  for (const row of rows) {
    const mapped = mapLorrigoCourierRow(row);
    if (mapped && mapped.serviceable) out.push(mapped);
  }
  return out;
}

export async function fetchLorrigoServiceableCouriers(
  input: ProviderServiceabilityInput
): Promise<ProviderCourierOption[]> {
  if (!/^\d{6}$/.test(input.fromPincode) || !/^\d{6}$/.test(input.toPincode)) {
    throw new AppError(400, "Invalid pincode (expected 6 digits)");
  }
  for (const [label, v] of [
    ["weight", input.weightKg],
    ["length", input.lengthCm],
    ["width", input.widthCm],
    ["height", input.heightCm],
  ] as const) {
    if (v != null && (!(Number(v) > 0) || !Number.isFinite(Number(v)))) {
      throw new AppError(400, `Invalid ${label} (must be a positive number)`);
    }
  }

  const payload = buildLorrigoServiceabilityPayload(input);
  const raw = await lorrigoPost<unknown>("/v2/plans/serviceable-couriers", payload);
  return normalizeLorrigoServiceabilityResponse(raw);
}
