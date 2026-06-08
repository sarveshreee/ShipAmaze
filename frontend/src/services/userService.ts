import { apiClient } from "@/lib/apiClient";
import type { UserRole } from "./authService";

export interface UserListRow {
  user_id: string;
  full_name: string | null;
  business_name: string | null;
  role: string;
}

export type AdminUserStatus = "active" | "inactive" | "blocked";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyName: string;
  phone: string;
  status: AdminUserStatus;
  permissions: string[];
  emailVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminUserDetail = AdminUserRow & {
  dropshipper?: { accessType: "FULL" | "RESTRICTED"; allowWarehouseAccess: boolean } | null;
};

export type Paginated<T> = { items: T[]; total: number; page: number; limit: number };

export type CreateAdminUserBody = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  companyName?: string;
  phone?: string;
  status?: "active" | "inactive";
  permissions?: string[];
  sendWelcomeEmail?: boolean;
  accessType?: "FULL" | "RESTRICTED";
  allowWarehouseAccess?: boolean;
};

export type PatchAdminUserBody = {
  name?: string;
  phone?: string;
  companyName?: string;
  status?: AdminUserStatus;
  permissions?: string[];
  accessType?: "FULL" | "RESTRICTED";
  allowWarehouseAccess?: boolean;
};

export async function listUsersByRole(role: Exclude<UserRole, "admin">) {
  const q = new URLSearchParams({ role });
  return apiClient.get<UserListRow[]>(`/users/by-role?${q.toString()}`);
}

export function adminListUsers(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  return apiClient.get<Paginated<AdminUserRow>>(`/admin/users?${q.toString()}`);
}

export function adminCreateUser(body: CreateAdminUserBody) {
  return apiClient.post<{ user: AdminUserRow }>("/admin/users/create", body);
}

export function adminGetUser(id: string) {
  return apiClient.get<{ user: AdminUserDetail }>(`/admin/users/${encodeURIComponent(id)}`);
}

export function adminPatchUser(id: string, body: PatchAdminUserBody) {
  return apiClient.patch<{ user: AdminUserRow }>(`/admin/users/${encodeURIComponent(id)}`, body);
}

export function adminResetUserPassword(id: string, newPassword: string) {
  return apiClient.post<{ ok: boolean; message: string }>(
    `/admin/users/${encodeURIComponent(id)}/reset-password`,
    { newPassword }
  );
}
