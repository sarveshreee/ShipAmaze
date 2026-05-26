import { apiClient } from "@/lib/apiClient";
import type { Vendor } from "@/types/logistics";

export async function listVendors() {
  return apiClient.get<Vendor[]>("/vendors");
}

export async function createVendor(body: Partial<Vendor> & { name: string }) {
  return apiClient.post<Vendor>("/vendors", body);
}

export async function updateVendor(id: string, body: Partial<Vendor>) {
  return apiClient.patch<Vendor>(`/vendors/${encodeURIComponent(id)}`, body);
}

export async function deleteVendor(id: string) {
  return apiClient.delete<{ ok: boolean }>(`/vendors/${encodeURIComponent(id)}`);
}

export async function listVendorAccounts() {
  return apiClient.get<{ user_id: string; full_name: string; business_name: string }[]>("/vendors/accounts");
}
