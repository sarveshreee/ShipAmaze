import { apiClient } from "@/lib/apiClient";
import type { WeightDispute } from "@/types/logistics";

export async function listWeightDisputes() {
  return apiClient.get<WeightDispute[]>("/weight-disputes");
}
