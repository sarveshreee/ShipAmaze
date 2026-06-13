import { apiClient } from "@/lib/apiClient";

export type CourierWeightSlab = {
  weightKg: number;
  weightLabel: string;
  prepaidRate: number;
  codRate: number;
};

export type CourierRateMaster = {
  id: string;
  courierName: string;
  carrierId: string;
  active: boolean;
  weightSlabs: CourierWeightSlab[];
  marginPercent: number | null;
  priority: number | null;
  slaDays: number | null;
  notes: string;
};

export type AvailableCourier = {
  name: string;
  carrierId: string;
  source: "courier" | "rate_master" | "both";
  priority: number;
};

export const DEFAULT_WEIGHT_SLABS: CourierWeightSlab[] = [
  { weightKg: 0.5, weightLabel: "0.5 kg", prepaidRate: 0, codRate: 0 },
  { weightKg: 1, weightLabel: "1 kg", prepaidRate: 0, codRate: 0 },
  { weightKg: 2, weightLabel: "2 kg", prepaidRate: 0, codRate: 0 },
  { weightKg: 5, weightLabel: "5 kg", prepaidRate: 0, codRate: 0 },
  { weightKg: 10, weightLabel: "10 kg", prepaidRate: 0, codRate: 0 },
];

export function listCourierRateMasters() {
  return apiClient.get<{ items: CourierRateMaster[] }>("/admin/courier-rates");
}

export function listAvailableCouriers() {
  return apiClient.get<{ items: AvailableCourier[] }>("/admin/couriers/available");
}

export function createCourierRateMaster(body: {
  courierName: string;
  carrierId?: string;
  active?: boolean;
  weightSlabs?: CourierWeightSlab[];
}) {
  return apiClient.post<CourierRateMaster>("/admin/courier-rates", body);
}

export function updateCourierRateMaster(
  id: string,
  body: Partial<{
    courierName: string;
    carrierId: string;
    active: boolean;
    weightSlabs: CourierWeightSlab[];
    marginPercent: number | null;
    priority: number | null;
    slaDays: number | null;
    notes: string;
  }>
) {
  return apiClient.patch<CourierRateMaster>(`/admin/courier-rates/${encodeURIComponent(id)}`, body);
}

export function deleteCourierRateMaster(id: string) {
  return apiClient.delete<{ ok: boolean }>(`/admin/courier-rates/${encodeURIComponent(id)}`);
}
