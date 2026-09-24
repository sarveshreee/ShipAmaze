import { apiClient } from "@/lib/apiClient";
import type { PickupAddress } from "@/types/logistics";

const BASE = "/pickup-addresses";

export type PickupAddressPayload = {
  label?: string;
  pickupName?: string;
  warehouseName?: string;
  contactName?: string;
  contactPerson?: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  gstin?: string;
  isDefault?: boolean;
  isActive?: boolean;
  /** Admin only — target vendor/dropshipper user id */
  userId?: string;
  /** Opt-in provider sync on create/update — nothing syncs unless listed */
  syncProviders?: Array<"velocity" | "lorrigo">;
  syncToVelocity?: boolean;
  syncToLorrigo?: boolean;
};

function unwrapList(body: unknown): PickupAddress[] {
  if (Array.isArray(body)) return body as PickupAddress[];
  if (body && typeof body === "object" && "data" in body) {
    const d = (body as { data?: unknown }).data;
    if (Array.isArray(d)) return d as PickupAddress[];
  }
  return [];
}

function unwrapOne(body: unknown): PickupAddress {
  if (body && typeof body === "object" && "data" in body) {
    const d = (body as { data?: PickupAddress }).data;
    if (d && typeof d === "object" && "id" in d) return d;
  }
  return body as PickupAddress;
}

export async function listPickupAddresses(scope?: "platform", ownership?: "own") {
  const q = new URLSearchParams();
  if (scope === "platform") q.set("scope", "platform");
  if (ownership === "own") q.set("ownership", "own");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const raw = await apiClient.get<unknown>(`${BASE}${suffix}`);
  return unwrapList(raw);
}

export type PickupSaveResponse = {
  success?: boolean;
  data?: PickupAddress;
  velocitySync?: {
    linked?: boolean;
    warehouse_id?: string;
    skipped?: boolean;
    reason?: string;
    error?: string;
  };
  lorrigoSync?: {
    synced?: boolean;
    pickupId?: string;
    alreadySynced?: boolean;
    skipped?: boolean;
    reason?: string;
    error?: string;
    durationMs?: number;
  };
};

export async function retryLorrigoPickupSync(pickupId: string) {
  return apiClient.post<{
    success: boolean;
    lorrigoSync?: PickupSaveResponse["lorrigoSync"];
    data?: Pick<
      PickupAddress,
      "id" | "lorrigoPickupId" | "lorrigoSyncStatus" | "lorrigoLastSyncAt" | "lorrigoSyncError"
    >;
  }>(`/lorrigo/pickups/${encodeURIComponent(pickupId)}/sync`, {});
}

export async function createPickupAddress(body: PickupAddressPayload): Promise<PickupSaveResponse> {
  const raw = await apiClient.post<unknown>(BASE, body);
  if (raw && typeof raw === "object" && "success" in raw) return raw as PickupSaveResponse;
  return { data: unwrapOne(raw) };
}

export async function updatePickupAddress(id: string, body: Partial<PickupAddressPayload>): Promise<PickupSaveResponse> {
  const raw = await apiClient.put<unknown>(`${BASE}/${encodeURIComponent(id)}`, body);
  if (raw && typeof raw === "object" && "success" in raw) return raw as PickupSaveResponse;
  return { data: unwrapOne(raw) };
}

export async function deletePickupAddress(id: string) {
  return apiClient.delete<{ success: boolean; message?: string }>(`${BASE}/${encodeURIComponent(id)}`);
}

export async function setDefaultPickupAddress(id: string) {
  const raw = await apiClient.patch<unknown>(`${BASE}/${encodeURIComponent(id)}/default`, {});
  return unwrapOne(raw);
}
