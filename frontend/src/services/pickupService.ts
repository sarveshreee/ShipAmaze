import { apiClient } from "@/lib/apiClient";
import type { PickupAddress } from "@/types/logistics";

const BASE = "/pickup-addresses";

export type PickupAddressPayload = {
  label?: string;
  pickupName?: string;
  warehouseName?: string;
  contactName?: string;
  contactPerson?: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  gstin?: string;
  isDefault?: boolean;
  isActive?: boolean;
  /** Admin only — target vendor/dropshipper user id */
  userId?: string;
};

function unwrapList(body: unknown): PickupAddress[] {
  if (Array.isArray(body)) return body as PickupAddress[];
  if (body && typeof body === "object" && "data" in body) {
    const d = (body as { data?: unknown }).data;
    if (Array.isArray(d)) return d as PickupAddress[];
  }
  return [];
}

function unwrapOne(body: unknown): PickupAddress {
  if (body && typeof body === "object" && "data" in body) {
    const d = (body as { data?: PickupAddress }).data;
    if (d && typeof d === "object" && "id" in d) return d;
  }
  return body as PickupAddress;
}

export async function listPickupAddresses() {
  const raw = await apiClient.get<unknown>(BASE);
  return unwrapList(raw);
}

export async function createPickupAddress(body: PickupAddressPayload) {
  const raw = await apiClient.post<unknown>(BASE, body);
  return unwrapOne(raw);
}

export async function updatePickupAddress(id: string, body: Partial<PickupAddressPayload>) {
  const raw = await apiClient.put<unknown>(`${BASE}/${encodeURIComponent(id)}`, body);
  return unwrapOne(raw);
}

export async function deletePickupAddress(id: string) {
  return apiClient.delete<{ success: boolean; message?: string }>(`${BASE}/${encodeURIComponent(id)}`);
}

export async function setDefaultPickupAddress(id: string) {
  const raw = await apiClient.patch<unknown>(`${BASE}/${encodeURIComponent(id)}/default`, {});
  return unwrapOne(raw);
}
