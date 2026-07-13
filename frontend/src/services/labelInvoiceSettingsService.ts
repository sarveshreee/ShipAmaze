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

/** Dropshipper: read own shipping-label logo. */
export async function getMyLabelLogo(): Promise<{ logoUrl: string }> {
  return apiClient.get<{ logoUrl: string }>("/account/label-logo");
}

/** Dropshipper: upload / replace own shipping-label logo. */
export async function putMyLabelLogo(logoUrl: string): Promise<{ logoUrl: string }> {
  return apiClient.put<{ logoUrl: string }>("/account/label-logo", { logoUrl });
}

/** Dropshipper: remove own shipping-label logo. */
export async function deleteMyLabelLogo(): Promise<{ logoUrl: string }> {
  return apiClient.delete<{ logoUrl: string }>("/account/label-logo");
}

/** Resolve per-order dropshipper logos for label printing. */
export async function resolveOrderLabelLogos(orderIds: string[]): Promise<Record<string, string>> {
  if (!orderIds.length) return {};
  const res = await apiClient.post<{ logos: Record<string, string> }>("/settings/label-invoice/resolve-logos", {
    orderIds,
  });
  return res.logos ?? {};
}
