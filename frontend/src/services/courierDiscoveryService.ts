/**
 * Multi-provider courier discovery (Velocity + Lorrigo).
 * Prefer this over velocity-only serviceability when showing courier options.
 */

import { apiClient } from "@/lib/apiClient";

export type CourierProviderLabel = "velocity" | "lorrigo";

export interface DiscoveredCourier {
  courierId: string;
  courierName: string;
  provider: CourierProviderLabel;
  serviceable: boolean;
  estimatedDays?: number;
  freight?: number;
  freightCharge?: number;
  totalCharge?: number;
  codSupported?: boolean;
  pickupAvailable?: boolean;
  priorityScore?: number;
  tat?: string;
  zone?: string;
  /** Velocity UI aliases */
  carrier_id?: string | number;
  carrier_name?: string;
  freight_charge?: number;
  total_charge?: number;
  metadata?: Record<string, unknown>;
}

export interface DiscoveryParams {
  from: string;
  to: string;
  payment_mode: "cod" | "prepaid";
  shipment_type?: "forward" | "return";
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  cod_value?: number;
  /** Override server COURIER_DISCOVERY_MODE for this request. */
  mode?: "velocity" | "lorrigo" | "both";
}

function toUiCourier(c: DiscoveredCourier): DiscoveredCourier {
  return {
    ...c,
    carrier_id: c.courierId,
    carrier_name: c.courierName,
    freight_charge: c.freight ?? c.freightCharge,
    total_charge: c.totalCharge ?? c.freight ?? c.freightCharge,
  };
}

export async function discoverServiceability(params: DiscoveryParams) {
  const res = await apiClient.post<{
    success: boolean;
    data: DiscoveredCourier[];
    providers?: unknown[];
    metrics?: unknown;
    serviceable?: boolean;
  }>("/courier/serviceability", params);
  return {
    ...res,
    data: (res.data ?? []).map(toUiCourier),
  };
}

export async function discoverRates(params: DiscoveryParams) {
  const res = await apiClient.post<{
    success: boolean;
    data: DiscoveredCourier[];
    providers?: unknown[];
    metrics?: unknown;
  }>("/courier/rates", params);
  return {
    ...res,
    data: (res.data ?? []).map(toUiCourier),
  };
}

export function providerDisplayName(provider?: string): string {
  if (provider === "lorrigo") return "Lorrigo";
  if (provider === "velocity") return "Velocity";
  return "Courier";
}
