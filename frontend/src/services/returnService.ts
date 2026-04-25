import { apiClient } from "@/lib/apiClient";

export async function listReturns() {
  return apiClient.get<unknown[]>("/returns");
}

export async function updateReturn(returnId: string, body: Record<string, unknown>) {
  return apiClient.patch(`/returns/${encodeURIComponent(returnId)}`, body);
}
