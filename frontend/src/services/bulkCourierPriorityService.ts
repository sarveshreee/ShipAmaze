import { apiClient } from "@/lib/apiClient";

export type BulkCourierPriorityEntry = {
  courierName: string;
  carrierId?: string;
  rank: number;
};

export type VelocityLaneCarrier = {
  carrier_id: string;
  carrier_name: string;
};

export function getBulkCourierPriority() {
  return apiClient.get<{ priorities: BulkCourierPriorityEntry[] }>("/admin/bulk-courier-priority");
}

export function saveBulkCourierPriority(priorities: BulkCourierPriorityEntry[]) {
  return apiClient.put<{ priorities: BulkCourierPriorityEntry[] }>("/admin/bulk-courier-priority", {
    priorities,
  });
}

export function listVelocityCarriersForLane(params: {
  pickupAddressId?: string;
  fromPin?: string;
  toPin: string;
  payment_mode?: "cod" | "prepaid";
}) {
  const q = new URLSearchParams();
  if (params.pickupAddressId) q.set("pickupAddressId", params.pickupAddressId);
  if (params.fromPin) q.set("fromPin", params.fromPin);
  q.set("toPin", params.toPin);
  if (params.payment_mode) q.set("payment_mode", params.payment_mode);
  return apiClient.get<{ items: VelocityLaneCarrier[]; fromPin: string; toPin: string }>(
    `/admin/bulk-courier-priority/velocity-carriers?${q.toString()}`
  );
}
