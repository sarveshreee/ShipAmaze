import { apiClient } from "@/lib/apiClient";
import type { LabelInvoiceSettings } from "@/types/labelInvoice";

export async function getLabelInvoiceSettings(): Promise<LabelInvoiceSettings> {
  return apiClient.get<LabelInvoiceSettings>("/settings/label-invoice");
}

export async function putLabelInvoiceSettings(body: LabelInvoiceSettings): Promise<LabelInvoiceSettings> {
  return apiClient.put<LabelInvoiceSettings>("/settings/label-invoice", body);
}

/** Public read-only label layout fields (no auth). */
export async function getPublicLabelInvoiceSettings(): Promise<LabelInvoiceSettings> {
  return apiClient.get<LabelInvoiceSettings>("/public/settings/label-invoice");
}
