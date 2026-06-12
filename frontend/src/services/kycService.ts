import { apiClient } from "@/lib/apiClient";

export type KycLegacyStatus = "draft" | "pending" | "verified" | "rejected";
export type KycStatus = "pending_kyc" | "pending_approval" | "approved" | "rejected";

export interface KycProfileResponse {
  status: KycLegacyStatus;
  kycStatus?: KycStatus;
  account_type: "individual" | "company";
  business_name?: string;
  full_name?: string;
  dob?: string;
  gst_number?: string;
  pan_number?: string;
  aadhaar_number?: string;
  cin_number?: string;
  address?: string;
  uploaded_docs?: Record<string, string>;
  documents?: Record<string, string>;
  rejectionRemark?: string;
}

export interface AdminKycRow extends KycProfileResponse {
  userId: string;
  name: string;
  email: string;
  companyName?: string;
  phone?: string;
  userStatus?: string;
  submittedAt?: string;
}

export async function getMyKyc() {
  return apiClient.get<KycProfileResponse>("/account/kyc");
}

export async function saveKycDraft(body: Record<string, unknown>) {
  return apiClient.put<{ ok: boolean }>("/account/kyc", body);
}

export async function submitKyc(body: Record<string, unknown>) {
  return apiClient.post<KycProfileResponse>("/account/kyc/submit", body);
}

export async function listAdminKyc(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiClient.get<AdminKycRow[]>(`/admin/kyc${q}`);
}

export async function getAdminKyc(userId: string) {
  return apiClient.get<AdminKycRow>(`/admin/kyc/${userId}`);
}

export async function approveKyc(userId: string) {
  return apiClient.post<{ ok: boolean }>(`/admin/kyc/${userId}/approve`, {});
}

export async function rejectKyc(userId: string, remark: string) {
  return apiClient.post<{ ok: boolean }>(`/admin/kyc/${userId}/reject`, { remark });
}

export function kycStatusLabel(status?: KycStatus | KycLegacyStatus): string {
  switch (status) {
    case "pending_approval":
    case "pending":
      return "Pending Approval";
    case "approved":
    case "verified":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "pending_kyc":
    case "draft":
    default:
      return "Pending KYC";
  }
}
