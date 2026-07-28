/**
 * Lorrigo serviceability / courier discovery — provider-specific mapping only.
 * Shared aggregation lives in modules/courier/discoverCouriers.ts.
 *
 * Live API note (2026-07): Postman `POST /v2/plans/serviceable-couriers` returns 404.
 * Working discovery path:
 *   GET /v2/couriers
 *   GET /v2/couriers/pricing/:courierId  (zone slab rates)
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
import { lorrigoGet } from "./lorrigo.client.js";

/** Kept for unit tests / future lane APIs — not used by the live fetch path. */
export function buildLorrigoServiceabilityPayload(input: ProviderServiceabilityInput): Record<string, unknown> {
  const weightKg = input.weightKg != null && input.weightKg > 0 ? input.weightKg : 0.5;
  const length = input.lengthCm != null && input.lengthCm > 0 ? input.lengthCm : 10;
  const width = input.widthCm != null && input.widthCm > 0 ? input.widthCm : 10;
  const height = input.heightCm != null && input.heightCm > 0 ? input.heightCm : 10;
  const paymentType = input.paymentMode === "cod" ? 1 : 0;
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
    root.couriers,
    root.data,
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
      for (const key of ["data", "couriers", "serviceableCouriers", "serviceable_couriers", "items", "zone_pricing"]) {
        const arr = nested[key];
        if (Array.isArray(arr) && key !== "zone_pricing") {
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
    "base_price",
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
    "is_cod_applicable",
  ]);
  const pickupAvailable = pickBool(source, [
    "pickupAvailable",
    "pickup",
    "isPickupAvailable",
    "pickup_available",
    "is_pickup_enabled",
  ]);
  const serviceable = pickBool(source, ["serviceable", "isServiceable", "is_serviceable", "is_active"]) ?? true;

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

type LorrigoPricingResult = {
  is_fw_applicable?: boolean;
  is_rto_applicable?: boolean;
  is_cod_applicable?: boolean;
  weight_slab?: number;
  increment_weight?: number;
  increment_price?: number;
  zone_pricing?: Array<{
    zone?: string;
    base_price?: number;
    increment_price?: number;
  }>;
};

/** Estimate freight from zone slab pricing (no lane→zone API available). */
export function estimateFreightFromLorrigoPricing(
  pricing: LorrigoPricingResult | null | undefined,
  weightKg: number
): number | undefined {
  if (!pricing) return undefined;
  const zones = Array.isArray(pricing.zone_pricing) ? pricing.zone_pricing : [];
  const bases = zones
    .map((z) => Number(z?.base_price))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (!bases.length) return undefined;

  // Prefer Z_A (same city-ish), else cheapest zone as a display estimate.
  const za = zones.find((z) => String(z?.zone ?? "").toUpperCase() === "Z_A");
  const base = Number.isFinite(Number(za?.base_price))
    ? Number(za!.base_price)
    : Math.min(...bases);
  const slab = Number(pricing.weight_slab) > 0 ? Number(pricing.weight_slab) : 0.5;
  const incW = Number(pricing.increment_weight) > 0 ? Number(pricing.increment_weight) : slab;
  const incP = Number(za?.increment_price ?? pricing.increment_price ?? zones[0]?.increment_price) || 0;

  let freight = base;
  const w = weightKg > 0 ? weightKg : slab;
  if (w > slab && incW > 0 && incP > 0) {
    freight += Math.ceil((w - slab) / incW) * incP;
  }
  return Math.round(freight * 100) / 100;
}

function extractPricingResult(raw: unknown): LorrigoPricingResult | null {
  const root = asRecord(raw);
  if (!root) return null;
  const result = asRecord(root.result) ?? root;
  return result as LorrigoPricingResult;
}

/**
 * Live Lorrigo discovery: list active couriers + attach zone-based price estimate.
 */
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

  const weightKg = input.weightKg != null && input.weightKg > 0 ? input.weightKg : 0.5;
  const wantReturn = input.shipmentType === "return";

  const listRaw = await lorrigoGet<unknown>("/v2/couriers");
  const rows = extractLorrigoCourierRows(listRaw);

  const active = rows.filter((row) => {
    const activeFlag = pickBool(row, ["is_active", "isActive", "active"]);
    if (activeFlag === false) return false;
    const reversed = pickBool(row, ["is_reversed_courier", "isReversedCourier"]) === true;
    // Inactive already excluded above; for returns include reverse + remaining active couriers.
    if (wantReturn) return true;
    return !reversed;
  });

  const priced = await Promise.all(
    active.map(async (row) => {
      const courierId = pickString(row, ["id", "courierId", "courier_id", "_id"]);
      const courierName = pickString(row, ["name", "courierName", "courier_name"]);
      if (!courierId || !courierName) return null;

      let pricing: LorrigoPricingResult | null = null;
      try {
        const raw = await lorrigoGet<unknown>(`/v2/couriers/pricing/${encodeURIComponent(courierId)}`);
        pricing = extractPricingResult(raw);
      } catch {
        pricing = null;
      }

      if (wantReturn && pricing && pricing.is_rto_applicable === false) {
        const reversed = pickBool(row, ["is_reversed_courier", "isReversedCourier"]) === true;
        if (!reversed) return null;
      }
      if (!wantReturn && pricing && pricing.is_fw_applicable === false) {
        return null;
      }

      const freight = estimateFreightFromLorrigoPricing(pricing, weightKg);
      const codSupported =
        pricing?.is_cod_applicable === true ||
        pickBool(row, ["is_cod_applicable", "cod", "codSupported"]) === true;

      return finalizeCourierOption({
        courierId,
        courierName,
        provider: "lorrigo",
        serviceable: true,
        freight,
        freightCharge: freight,
        totalCharge: freight,
        codSupported,
        cod: codSupported,
        pickupAvailable: true,
        zone: "Z_A",
        metadata: {
          source: "lorrigo",
          discovery: "couriers+pricing",
          type: pickString(row, ["type"]) || undefined,
          weightSlab: pricing?.weight_slab ?? pickNumber(row, ["weight_slab"]),
          priceNote: freight != null ? "Estimated from zone slab (Z_A / min zone)" : "Pricing unavailable",
        },
      });
    })
  );

  return priced.filter((x): x is ProviderCourierOption => Boolean(x));
}
