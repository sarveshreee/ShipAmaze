export const DEFAULT_COURIERS = [
  "Delhivery",
  "DTDC",
  "BlueDart",
  "Amazon",
  "Shadowfax",
  "Xpressbees",
] as const;

export const DEFAULT_ZONES = ["A", "B", "C", "D", "E"];
export const DEFAULT_WEIGHTS = ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"];
export const WEIGHT_INDICES = [0, 1, 2, 3, 4] as const;

export type CourierZoneRow = {
  courier: string;
  zone: string;
  rates: number[];
  codCharge: number;
  active: boolean;
};

export type EnterpriseRateRow = {
  courier: string;
  type: "FWD" | "RTO" | "REV";
  slab: "Base" | "Additional";
  zoneRates: number[];
  active: boolean;
};

export function defaultRateMatrix(): number[][] {
  return DEFAULT_ZONES.map((_, zi) =>
    DEFAULT_WEIGHTS.map((_, wi) => 30 + zi * 8 + wi * 15)
  );
}

export function buildDefaultCourierZoneRows(baseMatrix = defaultRateMatrix()): CourierZoneRow[] {
  const rows: CourierZoneRow[] = [];
  DEFAULT_COURIERS.forEach((courier, ci) => {
    DEFAULT_ZONES.forEach((zone, zi) => {
      rows.push({
        courier,
        zone,
        rates: baseMatrix[zi].map((v) => v + ci * 2),
        codCharge: 25 + ci * 5,
        active: true,
      });
    });
  });
  return rows;
}

export function buildDefaultEnterpriseRows(courierZoneRows: CourierZoneRow[]): EnterpriseRateRow[] {
  const types = ["FWD", "RTO", "REV"] as const;
  const slabs = ["Base", "Additional"] as const;
  const rows: EnterpriseRateRow[] = [];
  for (const courier of DEFAULT_COURIERS) {
    for (const type of types) {
      for (const slab of slabs) {
        const zoneRates = DEFAULT_ZONES.map((zone) => {
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

export function deriveLegacyRates(courierZoneRows: CourierZoneRow[]): number[][] {
  const primary = "Delhivery";
  return DEFAULT_ZONES.map((zone, zi) => {
    const primaryRow = courierZoneRows.find(
      (r) => r.courier === primary && r.zone === zone && r.active
    );
    if (primaryRow) return [...primaryRow.rates];
    const active = courierZoneRows.filter((r) => r.zone === zone && r.active);
    if (!active.length) return defaultRateMatrix()[zi];
    return DEFAULT_WEIGHTS.map((_, wi) => {
      const sum = active.reduce((s, r) => s + (r.rates[wi] ?? 0), 0);
      return Math.round((sum / active.length) * 100) / 100;
    });
  });
}

export function copyZoneAToAll(rows: CourierZoneRow[], courierFilter?: string): CourierZoneRow[] {
  const zoneA = rows.find((r) => r.zone === "A" && (!courierFilter || r.courier === courierFilter));
  if (!zoneA) return rows;
  return rows.map((r) => {
    if (courierFilter && r.courier !== courierFilter) return r;
    if (r.zone === "A") return r;
    const source = rows.find((x) => x.courier === r.courier && x.zone === "A");
    if (!source) return r;
    return { ...r, rates: [...source.rates], codCharge: source.codCharge };
  });
}

export function copyCourierPricing(
  rows: CourierZoneRow[],
  fromCourier: string,
  toCourier: string
): CourierZoneRow[] {
  return rows.map((r) => {
    if (r.courier !== toCourier) return r;
    const src = rows.find((x) => x.courier === fromCourier && x.zone === r.zone);
    if (!src) return r;
    return { ...r, rates: [...src.rates], codCharge: src.codCharge, active: src.active };
  });
}

export function applyMargin(rows: CourierZoneRow[], percent: number, courierFilter?: string): CourierZoneRow[] {
  const factor = 1 + percent / 100;
  return rows.map((r) => {
    if (courierFilter && r.courier !== courierFilter) return r;
    return {
      ...r,
      rates: r.rates.map((v) => Math.round(v * factor * 100) / 100),
      codCharge: Math.round(r.codCharge * factor * 100) / 100,
    };
  });
}

export function setCourierActive(rows: CourierZoneRow[], courier: string, active: boolean): CourierZoneRow[] {
  return rows.map((r) => (r.courier === courier ? { ...r, active } : r));
}

export function applyMarginEnterprise(
  rows: EnterpriseRateRow[],
  percent: number,
  courierFilter?: string
): EnterpriseRateRow[] {
  const factor = 1 + percent / 100;
  return rows.map((r) => {
    if (courierFilter && r.courier !== courierFilter) return r;
    return {
      ...r,
      zoneRates: r.zoneRates.map((v) => Math.round(v * factor * 100) / 100),
    };
  });
}

export function pricingEqual(
  a: CourierZoneRow[],
  b: CourierZoneRow[],
  ea: EnterpriseRateRow[],
  eb: EnterpriseRateRow[]
): boolean {
  return JSON.stringify({ a, ea }) === JSON.stringify({ b, eb });
}
