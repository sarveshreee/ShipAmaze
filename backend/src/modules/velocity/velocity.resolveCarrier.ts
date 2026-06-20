import { Courier } from "../../models/Courier.js";
import { CourierRateMaster } from "../../models/CourierRateMaster.js";
import type { IOrder } from "../../models/Order.js";
import { Pickup } from "../../models/Pickup.js";
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

/** List serviceable carriers for a lane (Velocity Serviceability API). */
export async function listServiceableCarriersForOrder(
  order: IOrder,
  opts: ResolveCarrierOpts = {}
): Promise<VelocityCarrier[]> {
  const lane = await resolveLanePincodes(order, opts);
  if (!lane) return [];
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
}
