import { apiClient } from "@/lib/apiClient";

export const SUPPORT_CATEGORIES = [
  "orders",
  "courier",
  "payment",
  "wallet",
  "shopify",
  "api",
  "pickup",
  "warehouse",
  "technical",
  "others",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export type SupportAttachment = {
  fileName: string;
  url: string;
  mimeType?: string;
  size?: number;
};

export type SupportTicketSummary = {
  id: string;
  ticketNumber: string;
  title: string;
  subject?: string;
  category?: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt?: string;
};

export type SupportComment = {
  userId: string;
  body: string;
  isInternal?: boolean;
  attachments?: SupportAttachment[];
  createdAt: string;
};

export function listMySupportTickets() {
  return apiClient.get<SupportTicketSummary[]>("/support/tickets");
}

export function getMySupportTicket(id: string) {
  return apiClient.get<Record<string, unknown>>(`/support/tickets/${encodeURIComponent(id)}`);
}

export function createSupportTicket(body: {
  subject: string;
  description: string;
  category: string;
  priority?: string;
  attachments?: SupportAttachment[];
}) {
  return apiClient.post<{ id: string; ticketNumber: string; status: string }>("/support/tickets", body);
}

export function addSupportTicketComment(id: string, body: string, attachments?: SupportAttachment[]) {
  return apiClient.post<{ ok: boolean }>(`/support/tickets/${encodeURIComponent(id)}/comments`, {
    body,
    attachments,
  });
}

export function categoryLabel(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
