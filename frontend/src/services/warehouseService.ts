import { apiClient } from "@/lib/apiClient";

export async function listWarehouses() {
  return apiClient.get<unknown[]>("/warehouses");
}

export async function createWarehouse(body: Record<string, unknown>) {
  return apiClient.post<unknown>("/warehouses", body);
}

export async function updateWarehouse(id: string, body: Record<string, unknown>) {
  return apiClient.patch<unknown>(`/warehouses/${encodeURIComponent(id)}`, body);
}

export async function deleteWarehouse(id: string) {
  return apiClient.delete<{ ok: boolean }>(`/warehouses/${encodeURIComponent(id)}`);
}
