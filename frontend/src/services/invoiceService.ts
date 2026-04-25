import { apiClient } from "@/lib/apiClient";
import type { Invoice } from "@/types/logistics";

export async function listInvoices() {
  return apiClient.get<Invoice[]>("/invoices");
}
