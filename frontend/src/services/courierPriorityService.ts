import { apiClient } from "@/lib/apiClient";

export type CourierPriorityRuleType =
  | "sku"
  | "weight"
  | "productName"
  | "sellerId"
  | "vendorId";

export type CourierPriorityEntry = {
  courierName: string;
  courierId?: string;
  rank: number;
};

export type CourierPriorityRule = {
  id: string;
  ruleType: CourierPriorityRuleType;
  matchValue: string;
  matchValueSecondary?: string;
  priorities: CourierPriorityEntry[];
  enabled: boolean;
  sortOrder: number;
  note?: string;
};

export function listCourierPriorityRules(ruleType?: string) {
  const q = ruleType ? `?ruleType=${encodeURIComponent(ruleType)}` : "";
  return apiClient.get<{ items: CourierPriorityRule[] }>(`/admin/courier-priority-rules${q}`);
}

export function createCourierPriorityRule(body: Partial<CourierPriorityRule>) {
  return apiClient.post<CourierPriorityRule>("/admin/courier-priority-rules", body);
}

export function updateCourierPriorityRule(id: string, body: Partial<CourierPriorityRule>) {
  return apiClient.patch<CourierPriorityRule>(`/admin/courier-priority-rules/${encodeURIComponent(id)}`, body);
}

export function deleteCourierPriorityRule(id: string) {
  return apiClient.delete<{ ok: boolean }>(`/admin/courier-priority-rules/${encodeURIComponent(id)}`);
}

export function reorderCourierPriorityRules(orderedIds: string[]) {
  return apiClient.post<{ ok: boolean }>("/admin/courier-priority-rules/reorder", { orderedIds });
}

export function evaluateCourierPriority(orderId: string) {
  return apiClient.post<{
    candidates: { courierName: string; source: string }[];
    matchedRules: string[];
  }>("/admin/courier-priority-rules/evaluate", { orderId });
}
