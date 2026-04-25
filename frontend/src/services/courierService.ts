import { apiClient } from "@/lib/apiClient";

export async function listCouriers() {
  return apiClient.get<unknown[]>("/couriers");
}

export async function upsertCourier(body: Record<string, unknown>) {
  return apiClient.post("/couriers", body);
}
