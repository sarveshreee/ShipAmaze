import { apiClient } from "@/lib/apiClient";

export interface TabPermissionRow {
  tab_key: string;
  enabled: boolean;
}

export async function getMyTabPermissions() {
  return apiClient.get<TabPermissionRow[]>("/tab-permissions/me");
}

export interface TabDefaultRow {
  role: string;
  tabKey: string;
  enabled: boolean;
  userId?: string | null;
}

export async function listTabDefaults() {
  return apiClient.get<TabDefaultRow[]>("/tab-permissions/defaults");
}

export async function upsertTabDefault(role: "vendor" | "dropshipper", tabKey: string, enabled: boolean) {
  return apiClient.post("/tab-permissions/defaults", { role, tabKey, enabled });
}

export async function listUserTabOverrides(userId: string, role: "vendor" | "dropshipper") {
  const q = new URLSearchParams({ userId, role });
  return apiClient.get<TabPermissionRow[]>(`/tab-permissions/user?${q.toString()}`);
}

export async function upsertUserTabOverride(body: {
  userId: string;
  role: "vendor" | "dropshipper";
  tabKey: string;
  enabled: boolean;
}) {
  return apiClient.post("/tab-permissions/user", body);
}

export async function resetUserTabOverrides(userId: string, role: "vendor" | "dropshipper") {
  const q = new URLSearchParams({ userId, role });
  return apiClient.delete(`/tab-permissions/user?${q.toString()}`);
}
