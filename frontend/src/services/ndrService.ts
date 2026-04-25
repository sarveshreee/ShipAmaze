import { apiClient } from "@/lib/apiClient";

export async function listNdr() {
  return apiClient.get<unknown[]>("/ndr");
}

export async function updateNdr(awb: string, body: Record<string, unknown>) {
  return apiClient.patch(`/ndr/${encodeURIComponent(awb)}`, body);
}
