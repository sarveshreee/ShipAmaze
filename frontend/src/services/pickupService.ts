import { apiClient } from "@/lib/apiClient";
import type { PickupAddress } from "@/types/logistics";

const BASE = "/pickup-addresses";

export type PickupAddressPayload = {
  label: string;
  contactName: string;
  phone: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  isDefault?: boolean;
  isActive?: boolean;
};

export async function listPickupAddresses() {
  return apiClient.get<PickupAddress[]>(BASE);
}

export async function createPickupAddress(body: PickupAddressPayload) {
  return apiClient.post<PickupAddress>(BASE, body);
}

export async function updatePickupAddress(id: string, body: Partial<PickupAddressPayload>) {
  return apiClient.put<PickupAddress>(`${BASE}/${encodeURIComponent(id)}`, body);
}

export async function deletePickupAddress(id: string) {
  return apiClient.delete<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}`);
}

export async function setDefaultPickupAddress(id: string) {
  return apiClient.patch<PickupAddress>(`${BASE}/${encodeURIComponent(id)}/default`, {});
}
