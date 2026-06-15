import { apiClient } from "@/lib/apiClient";

export async function listReturns() {
  return apiClient.get<unknown[]>("/returns");
}

export async function createReturn(data: {
  originalOrderId: string;
  customer?: string;
  reason: string;
  courier?: string;
  weight?: string;
  refundAmount?: number;
}) {
  return apiClient.post("/returns", data);
}

export async function updateReturn(returnId: string, body: Record<string, unknown>) {
  return apiClient.patch(`/returns/${encodeURIComponent(returnId)}`, body);
}
