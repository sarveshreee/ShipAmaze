import * as approvalService from "@/services/approvalService";
import { listPublicCourierRateMasters, type CourierRateMaster } from "@/services/courierRateService";
import { resolveSlabRate } from "@/lib/courierRateSlab";
import {
  DEFAULT_WEIGHTS,
  type CourierZoneRow,
} from "@/lib/courierPricingUtils";
import {
  formatRateAmount,
  normalizeZoneCode,
  weightSlabMultiplier,
} from "@/lib/shippingRateCardUtils";

export type RateQuoteSource = "rate_master" | "zone_card";

export type DropshipperRateQuote = {
  courier: string;
  carrierId?: string;
  zone?: string;
  freightCharge: number;
  codCharge?: number;
  totalCharge: number;
  source: RateQuoteSource;
  tat?: string;
  multiplier?: number;
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
  const { slabIdx, multiplier } = weightSlabMultiplier(DEFAULT_WEIGHTS, weightKg);
  const freight = row.rates[slabIdx];
  if (freight == null || !Number.isFinite(Number(freight))) return null;
  const base = Number(freight) * multiplier;
  if (payment === "cod") return base + Number(row.codCharge ?? 0);
  return base;
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

  const [mastersResp, rateCard] = await Promise.all([
    listPublicCourierRateMasters().catch(() => ({ items: [] as CourierRateMaster[] })),
    approvalService.getShippingRateCard(paymentType).catch(() => null),
  ]);

  const masters = (mastersResp.items ?? []).filter((m) => m.active !== false);
  const courierZoneRows = (rateCard?.courierZoneRows ?? []).filter((r) => r.active !== false);
  const displayRowsByCourier = new Map<string, CourierZoneRow>();
  for (const row of courierZoneRows) {
    const key = normalizeCourierName(row.courier);
    const existing = displayRowsByCourier.get(key);
    if (!existing || normalizeZoneCode(row.zone) === "A") {
      displayRowsByCourier.set(key, row);
    }
  }

  const courierNames = new Set<string>();
  for (const m of masters) courierNames.add(m.courierName);
  for (const r of displayRowsByCourier.values()) courierNames.add(r.courier);

  const quotes: DropshipperRateQuote[] = [];

  for (const courier of courierNames) {
    const master = masters.find((m) => normalizeCourierName(m.courierName) === normalizeCourierName(courier));
    const masterTotal = master ? masterRate(master, input.applicableWeightKg, input.paymentMode) : null;
    if (masterTotal != null && masterTotal > 0) {
      quotes.push({
        courier: master!.courierName,
        carrierId: master!.carrierId,
        freightCharge: masterTotal,
        totalCharge: masterTotal,
        source: "rate_master",
        tat: master!.slaDays ? `${master!.slaDays} days` : undefined,
      });
      continue;
    }

    const row = displayRowsByCourier.get(normalizeCourierName(courier));
    const zoneTotal = row ? rateFromCourierZoneRow(row, input.applicableWeightKg, input.paymentMode) : null;
    if (row && zoneTotal != null && zoneTotal > 0) {
      const { slabIdx, multiplier } = weightSlabMultiplier(DEFAULT_WEIGHTS, input.applicableWeightKg);
      const baseFreight = Number(row?.rates[slabIdx] ?? zoneTotal);
      const freight = baseFreight * multiplier;
      const codCharge = input.paymentMode === "cod" ? Number(row?.codCharge ?? 0) : undefined;
      quotes.push({
        courier,
        freightCharge: freight,
        codCharge,
        totalCharge: freight + (codCharge ?? 0),
        source: "zone_card",
        multiplier: multiplier > 1 ? multiplier : undefined,
      });
      continue;
    }
  }

  return quotes.sort((a, b) => a.totalCharge - b.totalCharge);
}

export function rateQuoteSourceLabel(source: RateQuoteSource): string {
  switch (source) {
    case "rate_master":
      return "Configured";
    case "zone_card":
      return "Rate card";
    default:
      return source;
  }
}

export function formatQuoteAmount(value: number): string {
  return formatRateAmount(value);
}
