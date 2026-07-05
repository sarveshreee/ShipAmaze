import { apiClient } from "@/lib/apiClient";

export type Paginated<T> = { items: T[]; total: number; page: number; limit: number };

export type LoginActivityRow = {
  id: string;
  userName: string;
  email: string;
  role: string;
  loginTime: string;
  logoutTime: string | null;
  lastActiveTime: string;
  sessionDuration: string;
  sessionDurationMs: number;
  browser: string;
  operatingSystem: string;
  deviceType: string;
  ipAddress: string;
  location: string | null;
  isActive: boolean;
};

export function adminListLoginActivity(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  return apiClient.get<Paginated<LoginActivityRow>>(`/admin/security/login-activity?${q.toString()}`);
}

export type ActivityLogRow = {
  id: string;
  userId: string;
  userName: string;
  role: string;
  module: string;
  action: string;
  metadata: Record<string, unknown> | null;
  browser: string;
  ipAddress: string;
  timestamp: string;
};

export function adminListActivityLogs(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  return apiClient.get<Paginated<ActivityLogRow> & { range?: { from: string; to: string } }>(
    `/admin/activity-logs?${q.toString()}`
  );
}

export function adminListActivityModules() {
  return apiClient.get<{ modules: string[] }>("/admin/activity-logs/modules");
}
