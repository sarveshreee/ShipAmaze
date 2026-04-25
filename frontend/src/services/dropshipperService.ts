import { apiClient } from "@/lib/apiClient";
import type { Dropshipper } from "@/types/logistics";

export async function listDropshippers() {
  return apiClient.get<Dropshipper[]>("/dropshippers");
}

export async function getKyc() {
  return apiClient.get<Record<string, unknown>>("/account/kyc");
}

export async function saveKyc(data: Record<string, unknown>) {
  return apiClient.put("/account/kyc", data);
}

export async function listBankAccounts() {
  return apiClient.get<unknown[]>("/account/banks");
}

export async function createBankAccount(body: Record<string, unknown>) {
  return apiClient.post("/account/banks", body);
}

export async function updateBankAccount(id: string, body: Record<string, unknown>) {
  return apiClient.patch(`/account/banks/${encodeURIComponent(id)}`, body);
}

export async function deleteBankAccount(id: string) {
  return apiClient.delete(`/account/banks/${encodeURIComponent(id)}`);
}

export async function getRouting() {
  return apiClient.get<{
    settings: Record<string, unknown>;
    preferredVendorId?: string;
    vendorOptions: { id: string; name: string }[];
  }>("/account/routing");
}

export async function saveRouting(body: Record<string, unknown>) {
  return apiClient.put("/account/routing", body);
}

export async function listTeamMembers() {
  return apiClient.get<unknown[]>("/account/team");
}

export async function inviteTeamMember(body: { email: string; role?: string }) {
  return apiClient.post("/account/team", body);
}

export async function removeTeamMember(id: string) {
  return apiClient.delete(`/account/team/${encodeURIComponent(id)}`);
}

export async function resendTeamInvite(id: string) {
  return apiClient.post(`/account/team/${encodeURIComponent(id)}/resend`, {});
}
