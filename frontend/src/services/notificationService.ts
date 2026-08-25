import { apiClient } from "@/lib/apiClient";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  meta?: Record<string, unknown>;
  createdAt: string;
};

export type NotificationsPage = {
  items: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
};

export function listNotifications(page = 1, limit = 20, opts?: { summary?: boolean }) {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (opts?.summary) q.set("summary", "1");
  return apiClient.get<NotificationsPage>(`/notifications?${q.toString()}`);
}

export function markNotificationRead(id: string) {
  return apiClient.patch<{ ok: boolean }>(`/notifications/${encodeURIComponent(id)}/read`, {});
}

export function markAllNotificationsRead() {
  return apiClient.post<{ ok: boolean }>("/notifications/read-all", {});
}

export function clearAllNotifications() {
  return apiClient.delete<{ ok: boolean }>("/notifications");
}
