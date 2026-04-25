import { apiClient } from "@/lib/apiClient";
import type { Vendor } from "@/types/logistics";

export async function listVendors() {
  return apiClient.get<Vendor[]>("/vendors");
}

export async function listVendorAccounts() {
  return apiClient.get<{ user_id: string; full_name: string; business_name: string }[]>("/vendors/accounts");
}
