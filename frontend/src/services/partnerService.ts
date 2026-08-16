import { apiClient } from "@/lib/apiClient";

export type PartnerStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";
export type PartnerProvider = "velocity" | "lorrigo" | "ekart";
export type PartnerKeyStatus = "ACTIVE" | "REVOKED" | "EXPIRED";
export type PartnerScope =
  | "serviceability:read"
  | "rates:read"
  | "shipments:create"
  | "shipments:read"
  | "shipments:cancel";

export const ALL_PARTNER_SCOPES: PartnerScope[] = [
  "serviceability:read",
  "rates:read",
  "shipments:create",
  "shipments:read",
  "shipments:cancel",
];

export const PARTNER_SCOPE_LABELS: Record<PartnerScope, string> = {
  "serviceability:read": "Serviceability",
  "rates:read": "Rates",
  "shipments:create": "Create shipments",
  "shipments:read": "Read shipments / tracking",
  "shipments:cancel": "Cancel shipments",
};

export interface AdminPartnerLinkedUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AdminPartnerRow {
  id: string;
  name: string;
  status: PartnerStatus;
  linkedUserId: string;
  allowedProviders?: PartnerProvider[];
  createdAt: string;
  activeKeyCount?: number;
  linkedUser?: AdminPartnerLinkedUser;
}

export interface AdminPartnerListResult {
  partners: AdminPartnerRow[];
  walletBillingEnabled: boolean;
}

export interface AdminPartnerKeyRow {
  id: string;
  keyPrefix: string;
  status: PartnerKeyStatus;
  scopes: string[];
  name?: string;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  revokedAt?: string;
}

export interface CreatePartnerBody {
  name: string;
  description?: string;
  linkedUserId: string;
  allowedProviders?: PartnerProvider[];
  allowedPickupIds?: string[];
}

export interface CreatePartnerKeyBody {
  name?: string;
  scopes?: PartnerScope[];
  expiresAt?: string;
}

export interface CreatePartnerKeyResult {
  key: string;
  keyPrefix: string;
  keyId: string;
  partnerId: string;
  scopes: string[];
  warning: string;
}

function unwrapData<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "data" in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

function unwrapMeta(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && "meta" in raw) {
    return (raw as { meta: Record<string, unknown> }).meta ?? {};
  }
  return {};
}

export async function listPartners(): Promise<AdminPartnerListResult> {
  const raw = await apiClient.get<{ success: boolean; data: AdminPartnerRow[]; meta?: { walletBillingEnabled?: boolean } }>(
    "/admin/partners"
  );
  const partners = unwrapData<AdminPartnerRow[]>(raw);
  const meta = unwrapMeta(raw);
  return {
    partners: Array.isArray(partners) ? partners : [],
    walletBillingEnabled: Boolean(meta.walletBillingEnabled),
  };
}

export async function createPartner(body: CreatePartnerBody): Promise<AdminPartnerRow> {
  const raw = await apiClient.post<{ success: boolean; data: AdminPartnerRow }>("/admin/partners", body);
  return unwrapData(raw);
}

export async function listPartnerKeys(partnerId: string): Promise<AdminPartnerKeyRow[]> {
  const raw = await apiClient.get<{ success: boolean; data: AdminPartnerKeyRow[] }>(
    `/admin/partners/${encodeURIComponent(partnerId)}/keys`
  );
  const data = unwrapData<AdminPartnerKeyRow[]>(raw);
  return Array.isArray(data) ? data : [];
}

export async function createPartnerKey(
  partnerId: string,
  body: CreatePartnerKeyBody = {}
): Promise<CreatePartnerKeyResult> {
  const raw = await apiClient.post<{ success: boolean; data: CreatePartnerKeyResult }>(
    `/admin/partners/${encodeURIComponent(partnerId)}/keys`,
    body
  );
  return unwrapData(raw);
}

export async function revokePartnerKey(partnerId: string, keyId: string): Promise<{ keyId: string; status: PartnerKeyStatus }> {
  const raw = await apiClient.post<{ success: boolean; data: { keyId: string; status: PartnerKeyStatus } }>(
    `/admin/partners/${encodeURIComponent(partnerId)}/keys/${encodeURIComponent(keyId)}/revoke`
  );
  return unwrapData(raw);
}

export async function updatePartnerStatus(
  partnerId: string,
  status: PartnerStatus,
  reason?: string
): Promise<AdminPartnerRow> {
  const raw = await apiClient.patch<{ success: boolean; data: AdminPartnerRow }>(
    `/admin/partners/${encodeURIComponent(partnerId)}/status`,
    { status, ...(reason ? { reason } : {}) }
  );
  return unwrapData(raw);
}
