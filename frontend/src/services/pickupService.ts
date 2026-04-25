import { apiClient } from "@/lib/apiClient";
import type { PickupAddress } from "@/types/logistics";

export async function listPickups() {
  return apiClient.get<PickupAddress[]>("/pickups");
}

export async function createPickup(body: Record<string, unknown>) {
  return apiClient.post<PickupAddress>("/pickups", body);
}
