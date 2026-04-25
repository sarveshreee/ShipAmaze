import { apiClient } from "@/lib/apiClient";
import type { PincodeService } from "@/types/logistics";

export async function listPincodes() {
  return apiClient.get<PincodeService[]>("/pincodes");
}

export async function upsertPincode(body: Record<string, unknown>) {
  return apiClient.post("/pincodes", body);
}
