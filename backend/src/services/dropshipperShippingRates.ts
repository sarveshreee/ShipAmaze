import { DropshipperShippingOverride, type IDropshipperShippingOverride } from "../models/DropshipperShippingOverride.js";

export type CourierRateRow = {
  courierName: string;
  carrierId?: string;
  surfaceRate?: number;
  airRate?: number;
  codRate?: number;
  enabled?: boolean;
};

export type VelocityRateRow = {
  carrier_id: string | number;
  carrier_name: string;
  freight_charge?: number;
  cod_charge?: number;
  rto_charge?: number;
  total_charge?: number;
  zone?: string;
  tat?: string;
};

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normName(name: string): string {
  return name.trim().toLowerCase();
}

/** Apply per-dropshipper courier overrides to Velocity rate quotes. */
export function applyDropshipperRateOverrides(
  rates: VelocityRateRow[],
  override: Pick<IDropshipperShippingOverride, "shippingCharge" | "surfaceRate" | "airRate" | "courierRates"> | null
): VelocityRateRow[] {
  if (!override) return rates;

  const courierRates = Array.isArray(override.courierRates) ? override.courierRates : [];
  const byName = new Map<string, CourierRateRow>();
  for (const row of courierRates) {
    if (!row?.courierName) continue;
    byName.set(normName(row.courierName), row);
  }

  const out: VelocityRateRow[] = [];
  for (const rate of rates) {
    const key = normName(rate.carrier_name);
    const custom = byName.get(key);
    if (custom && custom.enabled === false) continue;

    let freight = num(rate.freight_charge) ?? num(rate.total_charge) ?? 0;
    let total = num(rate.total_charge) ?? freight;

    if (custom) {
      const surface = num(custom.surfaceRate);
      const air = num(custom.airRate);
      const flat = num(override.shippingCharge);
      if (surface != null && surface > 0) {
        freight = surface;
        total = surface + (num(rate.cod_charge) ?? 0);
      } else if (air != null && air > 0) {
        freight = air;
        total = air + (num(rate.cod_charge) ?? 0);
      } else if (flat != null && flat > 0) {
        freight = flat;
        total = flat + (num(rate.cod_charge) ?? 0);
      }
    } else if (num(override.surfaceRate) != null && num(override.surfaceRate)! > 0) {
      freight = num(override.surfaceRate)!;
      total = freight + (num(rate.cod_charge) ?? 0);
    }

    out.push({
      ...rate,
      freight_charge: freight,
      total_charge: total,
    });
  }
  return out;
}

export async function loadDropshipperShippingOverride(userId: unknown) {
  if (!userId) return null;
  return DropshipperShippingOverride.findOne({ dropshipperUserId: userId }).lean();
}
