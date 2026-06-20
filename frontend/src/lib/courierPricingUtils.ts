export const DEFAULT_COURIERS = [
  "Delhivery",
  "DTDC",
  "BlueDart",
  "Amazon",
  "Shadowfax",
  "Xpressbees",
  "Ekart",
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

/** Zone-A freight slabs + COD — seeds missing couriers (matches backend presets). */
export const COURIER_ZONE_A_PRESETS: Record<
  string,
  { rates: [number, number, number, number, number]; codCharge: number }
> = {
  Delhivery: { rates: [85, 120, 205, 350, 450], codCharge: 25 },
  DTDC: { rates: [87, 122, 207, 352, 452], codCharge: 30 },
  BlueDart: { rates: [89, 124, 209, 354, 454], codCharge: 35 },
  Amazon: { rates: [91, 126, 211, 356, 456], codCharge: 40 },
  Shadowfax: { rates: [93, 128, 213, 358, 458], codCharge: 45 },
  Xpressbees: { rates: [95, 130, 215, 360, 460], codCharge: 50 },
  Ekart: { rates: [85, 120, 205, 350, 450], codCharge: 25 },
};

export function defaultRateMatrix(): number[][] {
  return DEFAULT_ZONES.map((_, zi) =>
    DEFAULT_WEIGHTS.map((_, wi) => 30 + zi * 8 + wi * 15)
  );
}

function presetRatesForZone(courier: string, zoneIndex: number): number[] {
  const preset = COURIER_ZONE_A_PRESETS[courier];
  const bump = zoneIndex * 2;
  if (preset) return preset.rates.map((r) => r + bump);
  const base = defaultRateMatrix()[zoneIndex] ?? defaultRateMatrix()[0];
  const ci = DEFAULT_COURIERS.indexOf(courier as (typeof DEFAULT_COURIERS)[number]);
  const courierBump = ci >= 0 ? ci * 2 : 0;
  return base.map((v) => v + courierBump);
}

function presetCodCharge(courier: string): number {
  return COURIER_ZONE_A_PRESETS[courier]?.codCharge ?? 25;
}

export function courierZoneRowKey(courier: string, zone: string): string {
  return `${courier}::${zone.toUpperCase()}`;
}

export function mergeCourierZoneRows(...layers: CourierZoneRow[][]): CourierZoneRow[] {
  const map = new Map<string, CourierZoneRow>();
  for (const layer of layers) {
    for (const row of layer) {
      if (!row?.courier?.trim() || !row?.zone?.trim()) continue;
      map.set(courierZoneRowKey(row.courier, row.zone), row);
    }
  }
  const courierOrder = (name: string) => {
    const i = (DEFAULT_COURIERS as readonly string[]).indexOf(name);
    return i >= 0 ? i : 999;
  };
  return Array.from(map.values()).sort(
    (a, b) => courierOrder(a.courier) - courierOrder(b.courier) || a.zone.localeCompare(b.zone)
  );
}

export function buildDefaultCourierZoneRows(baseMatrix = defaultRateMatrix()): CourierZoneRow[] {
  void baseMatrix;
  const rows: CourierZoneRow[] = [];
  DEFAULT_COURIERS.forEach((courier) => {
    DEFAULT_ZONES.forEach((zone, zi) => {
      rows.push({
        courier,
        zone,
        rates: presetRatesForZone(courier, zi),
        codCharge: presetCodCharge(courier),
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
