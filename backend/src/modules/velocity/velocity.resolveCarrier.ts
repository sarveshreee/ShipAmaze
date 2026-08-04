import { Courier } from "../../models/Courier.js";
import { CourierRateMaster } from "../../models/CourierRateMaster.js";
import type { IOrder } from "../../models/Order.js";
import { Pickup } from "../../models/Pickup.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { resolveCourierPriorityForOrder } from "../../services/courierPriorityService.js";
import * as velocityService from "./velocity.service.js";
import { normalizePincode } from "./velocity.payload.js";
import type { VelocityCarrier } from "./velocity.types.js";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match user-facing name (e.g. "Ekart") to Velocity carrier label (e.g. "Ekart Standard"). */
export function courierNameMatches(selected: string, velocityName: string): boolean {
  const a = selected.trim().toLowerCase();
  const b = velocityName.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const aToken = a.split(/\s+/)[0] ?? a;
  const bToken = b.split(/\s+/)[0] ?? b;
  return b.includes(a) || a.includes(b) || bToken === aToken;
}

export function pickCarrierFromList(
  couriers: VelocityCarrier[],
  courierName: string
): VelocityCarrier | undefined {
  const name = courierName.trim();
  if (!name || name.toLowerCase() === "auto") return undefined;
  const exact = couriers.find(
    (c) => String(c.carrier_name ?? "").trim().toLowerCase() === name.toLowerCase()
  );
  if (exact?.carrier_id != null && String(exact.carrier_id).trim()) return exact;
  return couriers.find((c) => courierNameMatches(name, String(c.carrier_name ?? "")));
}

export type ResolveCarrierOpts = {
  pickupPincode?: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
};

async function resolveLanePincodes(
  order: IOrder,
  opts: ResolveCarrierOpts
): Promise<{ fromPin: string; toPin: string; payment: "cod" | "prepaid" } | undefined> {
  const toPin = normalizePincode(String(order.shippingPincode ?? order.pincode ?? ""));
  let fromPin = opts.pickupPincode ? normalizePincode(opts.pickupPincode) : "";
  if (!fromPin && order.pickupAddress && typeof order.pickupAddress === "object") {
    const pa = order.pickupAddress as { pincode?: string };
    if (pa.pincode) fromPin = normalizePincode(String(pa.pincode));
  }
  if (!fromPin && order.pickupAddressId) {
    const pu = await Pickup.findById(order.pickupAddressId).select("pincode").lean();
    if (pu?.pincode) fromPin = normalizePincode(String(pu.pincode));
  }
  if (fromPin.length !== 6 || toPin.length !== 6) return undefined;
  const payment = String(order.payment ?? "").toLowerCase().includes("cod") ? "cod" : "prepaid";
  return { fromPin, toPin, payment };
}

/** Rates API expects dead_weight in grams; internal weight is kg when <= 30. */
function toDeadWeightGrams(weightKg: number): number {
  const w = weightKg > 0 ? weightKg : 0.5;
  if (w <= 30) return Math.max(1, Math.round(w * 1000));
  return Math.max(1, Math.round(w));
}

/**
 * Resolve Velocity carrier_id for a courier display name (e.g. "Ekart").
 * Order: CourierRateMaster → Courier DB → Serviceability API → Rates API.
 */
export async function resolveVelocityCarrierId(
  courierName: string,
  order: IOrder,
  opts: ResolveCarrierOpts = {}
): Promise<string | undefined> {
  const name = courierName.trim();
  if (!name || name.toLowerCase() === "auto") return undefined;

  const rateMaster = await CourierRateMaster.findOne({
    courierName: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
    active: { $ne: false },
  })
    .select("carrierId")
    .lean();
  if (rateMaster?.carrierId?.trim()) return rateMaster.carrierId.trim();

  const courierDoc = await Courier.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
  })
    .select("carrierId")
    .lean();
  if (courierDoc?.carrierId?.trim()) return courierDoc.carrierId.trim();

  const lane = await resolveLanePincodes(order, opts);
  if (!lane) return undefined;

  try {
    const svc = await velocityService.checkServiceability({
      from: lane.fromPin,
      to: lane.toPin,
      payment_mode: lane.payment,
      shipment_type: "forward",
    });
    const match = pickCarrierFromList(svc.data ?? [], name);
    if (match?.carrier_id != null && String(match.carrier_id).trim()) {
      return String(match.carrier_id).trim();
    }
  } catch {
    /* try rates next */
  }

  const weightKg = opts.weight ?? (parseFloat(String(order.weight ?? "")) || 0.5);
  const length = opts.length ?? order.length ?? 10;
  const width = opts.width ?? order.width ?? order.breadth ?? 10;
  const height = opts.height ?? order.height ?? 10;

  try {
    const rates = await velocityService.getRates({
      from: lane.fromPin,
      to: lane.toPin,
      weight: toDeadWeightGrams(weightKg),
      length,
      width,
      height,
      payment_mode: lane.payment,
      shipment_type: "forward",
      cod_value: lane.payment === "cod" ? Number(order.amount ?? 0) : undefined,
    });
    const match = pickCarrierFromList(rates.data ?? [], name);
    if (match?.carrier_id != null && String(match.carrier_id).trim()) {
      return String(match.carrier_id).trim();
    }
  } catch {
    /* unresolved */
  }

  return undefined;
}

/** Shared across one bulk Process Selected request so same lane hits Velocity once. */
export type ServiceabilityCache = Map<string, Promise<VelocityCarrier[]>>;

/** List serviceable carriers for a lane (Velocity Serviceability API). */
export async function listServiceableCarriersForOrder(
  order: IOrder,
  opts: ResolveCarrierOpts & { cache?: ServiceabilityCache } = {}
): Promise<VelocityCarrier[]> {
  const lane = await resolveLanePincodes(order, opts);
  if (!lane) return [];
  const key = `${lane.fromPin}|${lane.toPin}|${lane.payment}`;
  if (opts.cache?.has(key)) {
    return opts.cache.get(key)!;
  }
  const pending = (async (): Promise<VelocityCarrier[]> => {
    try {
      const svc = await velocityService.checkServiceability({
        from: lane.fromPin,
        to: lane.toPin,
        payment_mode: lane.payment,
        shipment_type: "forward",
      });
      return svc.data ?? [];
    } catch {
      return [];
    }
  })();
  opts.cache?.set(key, pending);
  return pending;
}

export type ResolvedServiceableCarrier = {
  carrier_id: string;
  carrier_name: string;
  provider?: "velocity" | "lorrigo";
};

export type PriorityCourierCandidate = {
  courierName: string;
  carrierId?: string;
  provider?: "velocity" | "lorrigo";
  rank?: number;
};

/** Multi-provider serviceable row used by Process Selected priority mode. */
export type PriorityServiceableCourier = {
  carrier_id: string;
  carrier_name: string;
  provider: "velocity" | "lorrigo";
};

function carrierRowToResolved(
  row: VelocityCarrier | PriorityServiceableCourier,
  fallbackName: string,
  provider?: "velocity" | "lorrigo"
): ResolvedServiceableCarrier | undefined {
  if (row.carrier_id == null || !String(row.carrier_id).trim()) return undefined;
  const prov =
    provider ??
    ("provider" in row && (row.provider === "lorrigo" || row.provider === "velocity")
      ? row.provider
      : "velocity");
  return {
    carrier_id: String(row.carrier_id).trim(),
    carrier_name: String(row.carrier_name ?? fallbackName).trim() || fallbackName,
    provider: prov,
  };
}

function poolForProvider(
  serviceable: Array<VelocityCarrier | PriorityServiceableCourier>,
  provider?: "velocity" | "lorrigo"
): Array<VelocityCarrier | PriorityServiceableCourier> {
  if (!provider) return serviceable;
  return serviceable.filter((c) => {
    const p = "provider" in c && c.provider ? c.provider : "velocity";
    return p === provider;
  });
}

function exactNameMatch(
  serviceable: Array<VelocityCarrier | PriorityServiceableCourier>,
  courierName: string
): VelocityCarrier | PriorityServiceableCourier | undefined {
  const name = courierName.trim().toLowerCase();
  if (!name) return undefined;
  return serviceable.find((c) => String(c.carrier_name ?? "").trim().toLowerCase() === name);
}

/**
 * Walk priority list in rank order and return the first courier that appears
 * in the live serviceability list. Used by Process Selected (priority mode)
 * so each order books exactly once with the highest-priority serviceable courier.
 *
 * Provider-aware: when a priority entry has provider=lorrigo|velocity, only that
 * provider's lane is considered (prevents Lorrigo "Delhivery Spcl…" fuzzy-matching
 * Velocity "Delhivery Standard").
 */
export function pickPriorityServiceableCourier(
  priorities: PriorityCourierCandidate[],
  serviceable: Array<VelocityCarrier | PriorityServiceableCourier>
): ResolvedServiceableCarrier | undefined {
  if (!priorities.length || !serviceable.length) return undefined;

  for (const candidate of priorities) {
    const preferredId = candidate.carrierId?.trim();
    const providerHint = candidate.provider;
    const pool = poolForProvider(serviceable, providerHint);

    if (preferredId) {
      const byId = pool.find((c) => String(c.carrier_id ?? "").trim() === preferredId);
      const resolved = byId
        ? carrierRowToResolved(
            byId,
            candidate.courierName,
            providerHint ?? ("provider" in byId ? byId.provider : "velocity")
          )
        : undefined;
      if (resolved) return resolved;
    }

    // Exact name first (cross-provider when hint missing so Lorrigo Spcl wins over Velocity fuzzy).
    const searchExact = providerHint ? pool : serviceable;
    const exact = exactNameMatch(searchExact, candidate.courierName);
    if (exact) {
      return carrierRowToResolved(
        exact,
        candidate.courierName,
        providerHint ?? ("provider" in exact ? exact.provider : "velocity")
      );
    }

    // Fuzzy name only within Velocity (legacy brand aliases). Never fuzzy-match Lorrigo→Velocity.
    const velocityPool = poolForProvider(serviceable, "velocity");
    if (!providerHint || providerHint === "velocity") {
      const fuzzy = pickCarrierFromList(velocityPool as VelocityCarrier[], candidate.courierName);
      const resolved = fuzzy ? carrierRowToResolved(fuzzy, candidate.courierName, "velocity") : undefined;
      if (resolved) return resolved;
    }
  }
  return undefined;
}

/**
 * Resolve a Velocity carrier that is serviceable for this order's lane.
 * When preferredCourierName is set, only that courier (or alias) is considered.
 * When omitted / Auto, uses priority rules then live rates/serviceability.
 */
export async function resolveServiceableCarrierForOrder(
  order: IOrder,
  opts: ResolveCarrierOpts & { preferredCourierName?: string } = {}
): Promise<ResolvedServiceableCarrier | undefined> {
  const preferred = String(opts.preferredCourierName ?? "").trim();
  const lane = await resolveLanePincodes(order, opts);
  if (!lane) return undefined;

  if (preferred && preferred.toLowerCase() !== "auto") {
    const fromMaster = await resolveVelocityCarrierId(preferred, order, opts);
    if (fromMaster) {
      const serviceable = await listServiceableCarriersForOrder(order, opts);
      const verified =
        serviceable.find((c) => String(c.carrier_id) === fromMaster) ??
        pickCarrierFromList(serviceable, preferred);
      if (verified) return carrierRowToResolved(verified, preferred);
      if (serviceable.length === 0) {
        return { carrier_id: fromMaster, carrier_name: preferred };
      }
    }
    const serviceable = await listServiceableCarriersForOrder(order, opts);
    const match = pickCarrierFromList(serviceable, preferred);
    if (match) return carrierRowToResolved(match, preferred);
    return undefined;
  }

  const serviceable = await listServiceableCarriersForOrder(order, opts);
  const { candidates } = await resolveCourierPriorityForOrder(order);
  for (const candidate of candidates) {
    const match =
      pickCarrierFromList(serviceable, candidate.courierName) ??
      (candidate.courierId?.trim()
        ? serviceable.find((c) => String(c.carrier_id) === candidate.courierId!.trim())
        : undefined);
    if (match) return carrierRowToResolved(match, candidate.courierName);
  }

  const weightKg = opts.weight ?? (parseFloat(String(order.weight ?? "")) || 0.5);
  const length = opts.length ?? order.length ?? 10;
  const width = opts.width ?? order.width ?? order.breadth ?? 10;
  const height = opts.height ?? order.height ?? 10;
  try {
    const rates = await velocityService.getRates({
      from: lane.fromPin,
      to: lane.toPin,
      weight: toDeadWeightGrams(weightKg),
      length,
      width,
      height,
      payment_mode: lane.payment,
      shipment_type: "forward",
      cod_value: lane.payment === "cod" ? Number(order.amount ?? 0) : undefined,
    });
    const first = rates.data?.[0];
    if (first) return carrierRowToResolved(first, String(first.carrier_name ?? "Auto"));
  } catch {
    /* fall through */
  }

  const firstServiceable = serviceable[0];
  if (firstServiceable) return carrierRowToResolved(firstServiceable, String(firstServiceable.carrier_name ?? "Auto"));
  return undefined;
}

export async function assertServiceableCarrierForOrder(
  order: IOrder,
  opts: ResolveCarrierOpts & { preferredCourierName?: string } = {}
): Promise<ResolvedServiceableCarrier> {
  const resolved = await resolveServiceableCarrierForOrder(order, opts);
  if (resolved) return resolved;
  const pin = normalizePincode(String(order.shippingPincode ?? order.pincode ?? ""));
  const preferred = String(opts.preferredCourierName ?? "").trim();
  const label = preferred && preferred.toLowerCase() !== "auto" ? `"${preferred}"` : "a serviceable courier";
  throw new AppError(
    422,
    `Order ${order.orderId}: ${label} cannot deliver to pincode ${pin || "unknown"}. Use Auto courier or process orders with the same serviceable lane separately.`
  );
}
