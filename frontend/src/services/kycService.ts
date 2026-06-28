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
  authorized_person_name?: string;
  authorized_person_pan?: string;
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
  role?: "admin" | "vendor" | "dropshipper" | string;
  userStatus?: string;
  submittedAt?: string;
}

const ADMIN_KYC_CACHE_MS = 30_000;
const adminKycCache = new Map<string, { rows: AdminKycRow[]; cachedAt: number }>();
const adminKycPending = new Map<string, Promise<AdminKycRow[]>>();

function clearAdminKycCache() {
  adminKycCache.clear();
  adminKycPending.clear();
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
  const key = status || "";
  const cached = adminKycCache.get(key);
  if (cached && Date.now() - cached.cachedAt < ADMIN_KYC_CACHE_MS) return cached.rows;

  if (!adminKycPending.has(key)) {
    adminKycPending.set(
      key,
      apiClient.get<AdminKycRow[]>(`/admin/kyc${q}`).then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        adminKycCache.set(key, { rows: list, cachedAt: Date.now() });
        adminKycPending.delete(key);
        return list;
      }).catch((error) => {
        adminKycPending.delete(key);
        throw error;
      })
    );
  }

  return adminKycPending.get(key)!;
}

export async function getAdminKyc(userId: string) {
  return apiClient.get<AdminKycRow>(`/admin/kyc/${userId}`);
}

export async function approveKyc(userId: string) {
  const result = await apiClient.post<{ ok: boolean }>(`/admin/kyc/${userId}/approve`, {});
  clearAdminKycCache();
  return result;
}

export async function rejectKyc(userId: string, remark: string) {
  const result = await apiClient.post<{ ok: boolean }>(`/admin/kyc/${userId}/reject`, { remark });
  clearAdminKycCache();
  return result;
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
