import { useEffect, useMemo, useState } from "react";
import type { Order } from "@/types/logistics";
import { checkServiceability, type VelocityCarrier } from "@/services/velocityService";

export function normalizePincode(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 6);
}

export function courierNameMatches(selected: string, velocityName: string): boolean {
  const a = selected.trim().toLowerCase();
  const b = velocityName.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const compact = (s: string) => s.replace(/[^a-z0-9]/g, "");
  const ac = compact(a);
  const bc = compact(b);
  if (ac && bc && Math.min(ac.length, bc.length) >= 4) {
    if (ac === bc || bc.startsWith(ac) || ac.startsWith(bc) || bc.includes(ac) || ac.includes(bc)) {
      return true;
    }
  }

  const aToken = a.split(/\s+/)[0] ?? a;
  const bToken = b.split(/\s+/)[0] ?? b;
  return b.includes(a) || a.includes(b) || bToken === aToken || compact(aToken) === compact(bToken);
}

export function carrierMatchesSelection(
  carrier: VelocityCarrier,
  selection: { carrierId?: string; courierName?: string }
): boolean {
  if (selection.carrierId?.trim()) {
    return String(carrier.carrier_id) === String(selection.carrierId).trim();
  }
  if (selection.courierName?.trim()) {
    return courierNameMatches(selection.courierName, String(carrier.carrier_name ?? ""));
  }
  return false;
}

export function orderPaymentMode(order: Order): "cod" | "prepaid" {
  return String(order.payment ?? "").toLowerCase().includes("cod") ? "cod" : "prepaid";
}

export function orderDestPincode(order: Order): string {
  return normalizePincode(order.shippingPincode || order.pincode);
}

function laneKey(fromPin: string, toPin: string, payment: "cod" | "prepaid"): string {
  return `${fromPin}|${toPin}|${payment}`;
}

export type ServiceabilityCourierFilter = {
  pickupPincode: string;
  carrierId?: string;
  courierName?: string;
};

export function useServiceableOrdersFilter(orders: Order[], filter: ServiceabilityCourierFilter | null) {
  const [laneCarriers, setLaneCarriers] = useState<Map<string, VelocityCarrier[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const active = Boolean(
    filter?.pickupPincode &&
      filter.pickupPincode.length === 6 &&
      (filter.carrierId?.trim() || filter.courierName?.trim())
  );

  const lanes = useMemo(() => {
    if (!filter?.pickupPincode || filter.pickupPincode.length !== 6) return [];
    const fromPin = filter.pickupPincode;
    const map = new Map<string, { toPin: string; payment: "cod" | "prepaid" }>();
    for (const o of orders) {
      const toPin = orderDestPincode(o);
      if (toPin.length !== 6) continue;
      const payment = orderPaymentMode(o);
      map.set(laneKey(fromPin, toPin, payment), { toPin, payment });
    }
    return [...map.entries()].map(([key, lane]) => ({ key, fromPin, ...lane }));
  }, [orders, filter?.pickupPincode]);

  useEffect(() => {
    if (!active || lanes.length === 0) {
      setLaneCarriers(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void Promise.all(
      lanes.map(async (lane) => {
        try {
          const res = await checkServiceability({
            from: lane.fromPin,
            to: lane.toPin,
            payment_mode: lane.payment,
            shipment_type: "forward",
          });
          return [lane.key, res.data ?? []] as readonly [string, VelocityCarrier[]];
        } catch {
          return [lane.key, [] as VelocityCarrier[]] as readonly [string, VelocityCarrier[]];
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setLaneCarriers(new Map(results));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [active, lanes]);

  const filteredOrders = useMemo(() => {
    if (!active || !filter) return orders;
    if (loading) return [];

    const fromPin = filter.pickupPincode;
    return orders.filter((o) => {
      const toPin = orderDestPincode(o);
      if (toPin.length !== 6) return false;
      const payment = orderPaymentMode(o);
      const carriers = laneCarriers.get(laneKey(fromPin, toPin, payment)) ?? [];
      return carriers.some((c) => carrierMatchesSelection(c, filter));
    });
  }, [orders, filter, laneCarriers, loading, active]);

  return { filteredOrders, loading, active };
}
