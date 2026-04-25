import { apiClient } from "@/lib/apiClient";
import type { UserRole } from "./authService";

export interface UserListRow {
  user_id: string;
  full_name: string | null;
  business_name: string | null;
  role: string;
}

export async function listUsersByRole(role: Exclude<UserRole, "admin">) {
  const q = new URLSearchParams({ role });
  return apiClient.get<UserListRow[]>(`/users/by-role?${q.toString()}`);
}
