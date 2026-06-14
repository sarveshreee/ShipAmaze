import {
  DEFAULT_WEIGHTS,
  DEFAULT_ZONES,
  defaultRateMatrix,
  type ICourierZoneRow,
  type IEnterpriseRateRow,
} from "../models/ShippingRateCard.js";

export const DEFAULT_COURIERS = [
  "Delhivery",
  "DTDC",
  "BlueDart",
  "Amazon",
  "Shadowfax",
  "Xpressbees",
] as const;

export const ENTERPRISE_TYPES = ["FWD", "RTO", "REV"] as const;
export const ENTERPRISE_SLABS = ["Base", "Additional"] as const;

export function parseNonNegative(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Rates must be numbers ≥ 0");
  return n;
}

export function parseCourierZoneRows(raw: unknown, zones: string[]): ICourierZoneRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ICourierZoneRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const courier = String(row.courier ?? "").trim();
    const zone = String(row.zone ?? "").trim().toUpperCase();
    if (!courier || !zones.includes(zone)) continue;
    const ratesRaw = row.rates;
    if (!Array.isArray(ratesRaw) || ratesRaw.length !== DEFAULT_WEIGHTS.length) {
      throw new Error(`Invalid weight rates for ${courier} zone ${zone}`);
    }
    const rates = ratesRaw.map((v) => parseNonNegative(v));
    out.push({
      courier,
      zone,
      rates,
      codCharge: parseNonNegative(row.codCharge ?? 0),
      active: row.active !== false,
    });
  }
  return out;
}

export function parseEnterpriseRows(raw: unknown, zones: string[]): IEnterpriseRateRow[] {
  if (!Array.isArray(raw)) return [];
  const out: IEnterpriseRateRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const courier = String(row.courier ?? "").trim();
    const type = String(row.type ?? "").trim().toUpperCase();
    const slab = String(row.slab ?? "").trim();
    if (!courier) continue;
    if (!ENTERPRISE_TYPES.includes(type as (typeof ENTERPRISE_TYPES)[number])) continue;
    if (!ENTERPRISE_SLABS.includes(slab as (typeof ENTERPRISE_SLABS)[number])) continue;
    const zoneRatesRaw = row.zoneRates;
    if (!Array.isArray(zoneRatesRaw) || zoneRatesRaw.length !== zones.length) {
      throw new Error(`Invalid zone rates for ${courier} ${type} ${slab}`);
    }
    out.push({
      courier,
      type: type as IEnterpriseRateRow["type"],
      slab: slab as IEnterpriseRateRow["slab"],
      zoneRates: zoneRatesRaw.map((v) => parseNonNegative(v)),
      active: row.active !== false,
    });
  }
  return out;
}

export function buildDefaultCourierZoneRows(
  couriers: readonly string[] = DEFAULT_COURIERS,
  zones: string[] = DEFAULT_ZONES,
  baseMatrix: number[][] = defaultRateMatrix()
): ICourierZoneRow[] {
  const rows: ICourierZoneRow[] = [];
  couriers.forEach((courier, ci) => {
    zones.forEach((zone, zi) => {
      const bump = ci * 2;
      rows.push({
        courier,
        zone,
        rates: baseMatrix[zi].map((v) => v + bump),
        codCharge: 25 + ci * 5,
        active: true,
      });
    });
  });
  return rows;
}

export function buildDefaultEnterpriseRows(
  courierZoneRows: ICourierZoneRow[],
  couriers: readonly string[] = DEFAULT_COURIERS,
  zones: string[] = DEFAULT_ZONES
): IEnterpriseRateRow[] {
  const rows: IEnterpriseRateRow[] = [];
  for (const courier of couriers) {
    for (const type of ENTERPRISE_TYPES) {
      for (const slab of ENTERPRISE_SLABS) {
        const zoneRates = zones.map((zone) => {
          const zr = courierZoneRows.find((r) => r.courier === courier && r.zone === zone);
          const base = zr?.rates[0] ?? 30;
          const add = Math.max(0, (zr?.rates[1] ?? base + 15) - base);
          if (type === "FWD" && slab === "Base") return base;
          if (type === "FWD" && slab === "Additional") return add;
          if (type === "RTO" && slab === "Base") return Math.round(base * 1.5 * 100) / 100;
          if (type === "RTO" && slab === "Additional") return Math.round(add * 1.2 * 100) / 100;
          if (type === "REV" && slab === "Base") return Math.round(base * 1.25 * 100) / 100;
          return Math.round(add * 1.1 * 100) / 100;
        });
        rows.push({ courier, type, slab, zoneRates, active: true });
      }
    }
  }
  return rows;
}

/** Dropshipper-facing zone matrix — primary Delhivery FWD active rows, else zone average. */
export function deriveLegacyRatesFromCourierRows(
  courierZoneRows: ICourierZoneRow[],
  zones: string[] = DEFAULT_ZONES,
  weightsCount = DEFAULT_WEIGHTS.length
): number[][] {
  const primary = "Delhivery";
  return zones.map((zone, zi) => {
    const primaryRow = courierZoneRows.find(
      (r) => r.courier === primary && r.zone === zone && r.active !== false
    );
    if (primaryRow?.rates?.length === weightsCount) return [...primaryRow.rates];

    const activeRows = courierZoneRows.filter((r) => r.zone === zone && r.active !== false);
    if (activeRows.length === 0) return [...defaultRateMatrix()[zi]];

    return Array.from({ length: weightsCount }, (_, wi) => {
      const sum = activeRows.reduce((s, r) => s + (r.rates[wi] ?? 0), 0);
      return Math.round((sum / activeRows.length) * 100) / 100;
    });
  });
}

export function migrateLegacyRatesToCourierRows(
  rates: number[][],
  zones: string[] = DEFAULT_ZONES,
  couriers: readonly string[] = DEFAULT_COURIERS
): ICourierZoneRow[] {
  return buildDefaultCourierZoneRows(couriers, zones, rates);
}
