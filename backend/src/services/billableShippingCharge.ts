import type { IOrder } from "../models/Order.js";
import {
  DEFAULT_WEIGHTS,
  ShippingRateCard,
  type ICourierZoneRow,
} from "../models/ShippingRateCard.js";
import { PincodeServiceability } from "../models/PincodeServiceability.js";
import { CourierRateMaster } from "../models/CourierRateMaster.js";

export type BillableShippingResult = {
  freight: number;
  codCharge: number;
  total: number;
  zone: string;
  source: "zone_card" | "rate_master";
  courier: string;
};

function parseWeightKgFromLabel(label: string): number {
  const n = Number(String(label).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function weightSlabMultiplier(
  weightLabels: string[],
  weightKg: number
): { slabIdx: number; multiplier: number } {
  if (!weightLabels.length) return { slabIdx: 0, multiplier: 1 };
  const parsed = weightLabels.map(parseWeightKgFromLabel);
  const idx = parsed.findIndex((w) => w >= weightKg);
  if (idx !== -1) return { slabIdx: idx, multiplier: 1 };
  const maxSlabKg = parsed[parsed.length - 1] || 1;
  return { slabIdx: parsed.length - 1, multiplier: Math.ceil(weightKg / maxSlabKg) };
}

function normalizeZone(zone: string): string {
  return String(zone ?? "")
    .trim()
    .toUpperCase()
    .replace(/^ZONE\s*/i, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match Velocity label (e.g. "Ekart Standard") to rate-card courier (e.g. "Ekart"). */
function matchRateCardCourier(velocityName: string, couriers: string[]): string {
  const n = velocityName.trim().toLowerCase();
  if (!n) return velocityName.trim();
  const exact = couriers.find((c) => c.toLowerCase() === n);
  if (exact) return exact;
  const token = n.split(/\s+/)[0] ?? n;
  const byToken = couriers.find(
    (c) => c.toLowerCase() === token || n.includes(c.toLowerCase()) || c.toLowerCase().includes(token)
  );
  return byToken ?? velocityName.trim();
}

function rateFromZoneRow(
  row: ICourierZoneRow,
  weightLabels: string[],
  weightKg: number,
  payment: "cod" | "prepaid"
): number {
  const { slabIdx, multiplier } = weightSlabMultiplier(weightLabels, weightKg);
  const freight = Number(row.rates[slabIdx] ?? 0) * multiplier;
  const cod = payment === "cod" ? Number(row.codCharge ?? 0) : 0;
  return freight + cod;
}

function resolveSlabFromMaster(
  slabs: Array<{ weightKg: number; prepaidRate: number; codRate?: number }>,
  weightKg: number,
  payment: "cod" | "prepaid"
): number {
  if (!slabs.length || !(weightKg > 0)) return 0;
  const sorted = [...slabs].sort((a, b) => a.weightKg - b.weightKg);
  const slab = sorted.find((s) => s.weightKg >= weightKg) ?? sorted[sorted.length - 1]!;
  const base = payment === "cod" ? (slab.codRate ?? slab.prepaidRate) : slab.prepaidRate;
  return Number.isFinite(base) ? base : 0;
}

/**
 * Admin-configured charge from Rates & Shipping (zone matrix / rate masters).
 * Dropshippers are billed this amount, not Velocity's actual freight.
 */
export async function resolveBillableShippingCharge(params: {
  order: IOrder;
  courierName: string;
  weightKg?: number;
}): Promise<BillableShippingResult | null> {
  const courierLabel = String(params.courierName ?? "").trim();
  if (!courierLabel || courierLabel.toLowerCase() === "auto") return null;

  const paymentType = String(params.order.payment ?? "").toLowerCase().includes("cod") ? "COD" : "Prepaid";
  const payment = paymentType === "COD" ? "cod" : "prepaid";

  const parsedWeight = parseFloat(String(params.order.weight ?? "")) || 0;
  const weightKg = params.weightKg ?? (parsedWeight > 0 ? parsedWeight : 0.5);

  const destPin = String(params.order.shippingPincode ?? params.order.pincode ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
  let zone = normalizeZone(String(params.order.zone ?? ""));
  if (!zone && destPin.length === 6) {
    const pinDoc = await PincodeServiceability.findOne({ pincode: destPin }).select("zone").lean();
    zone = normalizeZone(String(pinDoc?.zone ?? "A")) || "A";
  }
  if (!zone) zone = "A";

  const card = await ShippingRateCard.findOne({ paymentType }).lean();
  const weightLabels = card?.weights?.length ? card.weights : DEFAULT_WEIGHTS;
  const courierZoneRows = (card?.courierZoneRows ?? []).filter((r) => r.active !== false);

  if (courierZoneRows.length) {
    const courierNames = [...new Set(courierZoneRows.map((r) => r.courier))];
    const matchedCourier = matchRateCardCourier(courierLabel, courierNames);
    const row = courierZoneRows.find(
      (r) => r.courier === matchedCourier && normalizeZone(r.zone) === zone
    );
    if (row) {
      const { slabIdx, multiplier } = weightSlabMultiplier(weightLabels, weightKg);
      const freight = Number(row.rates[slabIdx] ?? 0) * multiplier;
      const codCharge = payment === "cod" ? Number(row.codCharge ?? 0) : 0;
      const total = rateFromZoneRow(row, weightLabels, weightKg, payment);
      return {
        freight,
        codCharge,
        total,
        zone,
        source: "zone_card",
        courier: matchedCourier,
      };
    }
  }

  const token = courierLabel.split(/\s+/)[0] ?? courierLabel;
  const master = await CourierRateMaster.findOne({
    courierName: { $regex: new RegExp(`^${escapeRegex(token)}$`, "i") },
    active: { $ne: false },
  }).lean();
  if (master?.weightSlabs?.length) {
    const total = resolveSlabFromMaster(master.weightSlabs, weightKg, payment);
    if (total > 0) {
      return {
        freight: total,
        codCharge: 0,
        total,
        zone,
        source: "rate_master",
        courier: master.courierName,
      };
    }
  }

  return null;
}

/** Set dropshipper-facing shippingCharges from admin rate card; store Velocity cost separately. */
export async function applyBillableShippingToOrder(
  order: IOrder,
  opts: { courierName: string; velocityFreightCost?: number; weightKg?: number }
): Promise<BillableShippingResult | null> {
  if (opts.velocityFreightCost != null && Number(opts.velocityFreightCost) > 0) {
    order.velocityFreightCost = Number(opts.velocityFreightCost);
  }

  const billable = await resolveBillableShippingCharge({
    order,
    courierName: opts.courierName,
    weightKg: opts.weightKg,
  });

  if (billable) {
    order.shippingCharges = billable.total;
    if (billable.codCharge > 0) order.codCharges = billable.codCharge;
    order.zone = billable.zone;
    return billable;
  }

  if (opts.velocityFreightCost != null && Number(opts.velocityFreightCost) > 0) {
    order.shippingCharges = Number(opts.velocityFreightCost);
  }

  return null;
}
