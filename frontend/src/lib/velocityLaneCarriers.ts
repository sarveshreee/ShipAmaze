import { checkServiceability, getRates } from "@/services/velocityService";

export type VelocityLaneCarrier = {
  carrier_id: string;
  carrier_name: string;
};

function pushCarrier(
  items: VelocityLaneCarrier[],
  seen: Set<string>,
  carrierId: unknown,
  carrierName: unknown
) {
  const id = carrierId != null ? String(carrierId).trim() : "";
  const name = String(carrierName ?? id).trim();
  if (!id || !name) return;
  const key = `${id}::${name}`.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  items.push({ carrier_id: id, carrier_name: name });
}

/** Load all Velocity courier services for a lane (rates + serviceability), with full carrier names. */
export async function fetchVelocityLaneCarriers(params: {
  fromPin: string;
  toPin: string;
  payment_mode?: "cod" | "prepaid";
}): Promise<VelocityLaneCarrier[]> {
  const fromPin = params.fromPin.replace(/\D/g, "").slice(0, 6);
  const toPin = params.toPin.replace(/\D/g, "").slice(0, 6);
  if (fromPin.length !== 6 || toPin.length !== 6) return [];

  const payment_mode = params.payment_mode ?? "prepaid";

  const [ratesRes, svcRes] = await Promise.all([
    getRates({
      from: fromPin,
      to: toPin,
      weight: 0.5,
      length: 10,
      width: 10,
      height: 10,
      payment_mode,
      shipment_type: "forward",
      ...(payment_mode === "cod" ? { cod_value: 500 } : {}),
    }).catch(() => ({ data: [] as { carrier_id: string | number; carrier_name: string }[] })),
    checkServiceability({
      from: fromPin,
      to: toPin,
      payment_mode,
      shipment_type: "forward",
    }).catch(() => ({ data: [] as { carrier_id: string | number; carrier_name: string }[] })),
  ]);

  const seen = new Set<string>();
  const items: VelocityLaneCarrier[] = [];
  for (const row of ratesRes.data ?? []) {
    pushCarrier(items, seen, row.carrier_id, row.carrier_name);
  }
  for (const row of svcRes.data ?? []) {
    pushCarrier(items, seen, row.carrier_id, row.carrier_name);
  }
  return items;
}

const GENERIC_COURIER_NAMES = new Set([
  "ekart",
  "amazon",
  "delhivery",
  "shadowfax",
  "xpressbees",
  "dtdc",
]);

export function isGenericCourierPriorityName(name: string): boolean {
  return GENERIC_COURIER_NAMES.has(String(name ?? "").trim().toLowerCase());
}

export function shouldReplaceSavedPrioritiesWithVelocity(
  saved: { courierName: string; carrierId?: string }[],
  velocityItems: VelocityLaneCarrier[]
): boolean {
  if (velocityItems.length === 0) return false;
  if (saved.length === 0) return true;
  return saved.some(
    (p) => !String(p.carrierId ?? "").trim() || isGenericCourierPriorityName(p.courierName)
  );
}
