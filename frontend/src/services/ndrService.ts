import { apiClient } from "@/lib/apiClient";

export async function listNdr() {
  return apiClient.get<unknown[]>("/ndr");
}

export async function updateNdr(awb: string, body: Record<string, unknown>) {
  return apiClient.patch(`/ndr/${encodeURIComponent(awb)}`, body);
}

/** Shared action names; `rto` is accepted as alias for return. */
export type NdrAction = "reattempt" | "rto" | "return" | "fake-attempt";

export async function submitNdrAction(
  awb: string,
  body: { action: NdrAction; remarks?: string; nextAttemptDate?: string }
) {
  return apiClient.post(`/ndr/${encodeURIComponent(awb)}/action`, body);
}

export type NdrSyncAggregate = {
  success: boolean;
  fetched: number;
  upserted: number;
  errors: number;
  duplicatesSuppressed?: number;
  providers?: Record<string, unknown>;
};

/** Sync NDR from all configured providers that support NDR. */
export async function syncNdrFromProviders(daysBack = 120) {
  return apiClient.post<NdrSyncAggregate>("/courier/sync-ndr", { daysBack });
}
