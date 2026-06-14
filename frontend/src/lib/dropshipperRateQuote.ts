import * as approvalService from "@/services/approvalService";
import * as velocityService from "@/services/velocityService";
import { listPublicCourierRateMasters, type CourierRateMaster } from "@/services/courierRateService";
import { resolveSlabRate } from "@/lib/courierRateSlab";
import {
  DEFAULT_WEIGHTS,
  type CourierZoneRow,
} from "@/lib/courierPricingUtils";
import {
  formatRateAmount,
  normalizeZoneCode,
  rateForZoneWeight,
  weightSlabIndex,
} from "@/lib/shippingRateCardUtils";

export type RateQuoteSource = "velocity" | "rate_master" | "zone_card";

export type DropshipperRateQuote = {
  courier: string;
  carrierId?: string;
  zone?: string;
  freightCharge: number;
  codCharge?: number;
  totalCharge: number;
  source: RateQuoteSource;
  tat?: string;
};

export type BuildRateQuotesInput = {
  pickupPin: string;
  deliveryPin: string;
  applicableWeightKg: number;
  paymentMode: "prepaid" | "cod";
  shipmentType: "forward" | "return";
  shipmentValue?: number;
  deliveryZone: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
};

function normalizeCourierName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function rateFromCourierZoneRow(
  row: CourierZoneRow,
  weightKg: number,
  payment: "prepaid" | "cod"
): number | null {
  const idx = weightSlabIndex(DEFAULT_WEIGHTS, weightKg);
  const freight = row.rates[idx];
  if (freight == null || !Number.isFinite(Number(freight))) return null;
  const base = Number(freight);
  if (payment === "cod") return base + Number(row.codCharge ?? 0);
  return base;
}

function zoneRowRate(
  rows: CourierZoneRow[],
  courier: string,
  zone: string,
  weightKg: number,
  payment: "prepaid" | "cod"
): number | null {
  const row = rows.find(
    (r) =>
      r.active !== false &&
      normalizeCourierName(r.courier) === normalizeCourierName(courier) &&
      normalizeZoneCode(r.zone) === normalizeZoneCode(zone)
  );
  if (!row) return null;
  return rateFromCourierZoneRow(row, weightKg, payment);
}

function masterRate(
  master: CourierRateMaster,
  weightKg: number,
  payment: "prepaid" | "cod"
): number | null {
  const rate = resolveSlabRate(master.weightSlabs ?? [], weightKg, payment);
  if (!(rate > 0)) return null;
  const margin = master.marginPercent ?? 0;
  if (margin > 0) return Math.round(rate * (1 + margin / 100) * 100) / 100;
  return rate;
}

export async function buildDropshipperRateQuotes(
  input: BuildRateQuotesInput
): Promise<DropshipperRateQuote[]> {
  const paymentType = input.paymentMode === "cod" ? "COD" : "Prepaid";
  const zone = normalizeZoneCode(input.deliveryZone);

  const [velocityResp, mastersResp, rateCard] = await Promise.all([
    velocityService
      .getRates({
        from: input.pickupPin,
        to: input.deliveryPin,
        weight: input.applicableWeightKg,
        length: input.lengthCm,
        width: input.widthCm,
        height: input.heightCm,
        payment_mode: input.paymentMode,
        cod_value: input.paymentMode === "cod" ? input.shipmentValue : undefined,
        shipment_type: input.shipmentType,
      })
      .catch(() => ({ data: [] as velocityService.VelocityRate[] })),
    listPublicCourierRateMasters().catch(() => ({ items: [] as CourierRateMaster[] })),
    approvalService.getShippingRateCard(paymentType).catch(() => null),
  ]);

  const velocityRates = velocityResp.data ?? [];
  const masters = (mastersResp.items ?? []).filter((m) => m.active !== false);
  const courierZoneRows = (rateCard?.courierZoneRows ?? []).filter((r) => r.active !== false);
  const legacyMatrix = rateCard?.rates ?? [];
  const legacyZones = rateCard?.zones ?? ["A", "B", "C", "D", "E"];
  const legacyWeights = rateCard?.weights ?? DEFAULT_WEIGHTS;

  const courierNames = new Set<string>();
  for (const v of velocityRates) courierNames.add(v.carrier_name);
  for (const m of masters) courierNames.add(m.courierName);
  for (const r of courierZoneRows) {
    if (normalizeZoneCode(r.zone) === normalizeZoneCode(zone)) courierNames.add(r.courier);
  }

  const quotes: DropshipperRateQuote[] = [];

  for (const courier of courierNames) {
    const velocityMatch = velocityRates.find(
      (v) => normalizeCourierName(v.carrier_name) === normalizeCourierName(courier)
    );
    if (velocityMatch && velocityMatch.total_charge > 0) {
      quotes.push({
        courier: velocityMatch.carrier_name,
        carrierId: String(velocityMatch.carrier_id ?? ""),
        zone: velocityMatch.zone ?? zone,
        freightCharge: velocityMatch.freight_charge ?? velocityMatch.total_charge,
        codCharge: velocityMatch.cod_charge,
        totalCharge: velocityMatch.total_charge,
        source: "velocity",
        tat: velocityMatch.tat,
      });
      continue;
    }

    const master = masters.find((m) => normalizeCourierName(m.courierName) === normalizeCourierName(courier));
    const masterTotal = master ? masterRate(master, input.applicableWeightKg, input.paymentMode) : null;
    if (masterTotal != null && masterTotal > 0) {
      quotes.push({
        courier: master!.courierName,
        carrierId: master!.carrierId,
        zone,
        freightCharge: masterTotal,
        totalCharge: masterTotal,
        source: "rate_master",
        tat: master!.slaDays ? `${master!.slaDays} days` : undefined,
      });
      continue;
    }

    const zoneTotal = zoneRowRate(courierZoneRows, courier, zone, input.applicableWeightKg, input.paymentMode);
    if (zoneTotal != null && zoneTotal > 0) {
      const row = courierZoneRows.find(
        (r) =>
          normalizeCourierName(r.courier) === normalizeCourierName(courier) &&
          normalizeZoneCode(r.zone) === normalizeZoneCode(zone)
      );
      const idx = weightSlabIndex(DEFAULT_WEIGHTS, input.applicableWeightKg);
      const freight = row?.rates[idx] ?? zoneTotal;
      const codCharge = input.paymentMode === "cod" ? Number(row?.codCharge ?? 0) : undefined;
      quotes.push({
        courier,
        zone,
        freightCharge: Number(freight),
        codCharge,
        totalCharge: zoneTotal,
        source: "zone_card",
      });
      continue;
    }
  }

  if (!quotes.length && legacyMatrix.length) {
    const legacyRate = rateForZoneWeight(legacyMatrix, legacyZones, zone, input.applicableWeightKg, legacyWeights);
    if (legacyRate != null && legacyRate > 0) {
      quotes.push({
        courier: "Standard",
        zone,
        freightCharge: legacyRate,
        totalCharge: legacyRate,
        source: "zone_card",
      });
    }
  }

  return quotes.sort((a, b) => a.totalCharge - b.totalCharge);
}

export function rateQuoteSourceLabel(source: RateQuoteSource): string {
  switch (source) {
    case "velocity":
      return "Live rate";
    case "rate_master":
      return "Configured";
    case "zone_card":
      return "Zone card";
    default:
      return source;
  }
}

export function formatQuoteAmount(value: number): string {
  return formatRateAmount(value);
}
