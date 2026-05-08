import { apiClient, downloadAuthenticatedFile } from "@/lib/apiClient";
import type { Invoice } from "@/types/logistics";

export type InvoiceListResponse = {
  items: Invoice[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listInvoices(params?: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") q.set(k, v);
    }
  }
  const s = q.toString();
  return apiClient.get<InvoiceListResponse>(`/invoices${s ? `?${s}` : ""}`);
}

export type InvoiceDetail = Invoice & {
  invoiceId: string;
  ordersCount: number;
  pdfAvailable: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export async function getInvoice(invoiceId: string) {
  return apiClient.get<InvoiceDetail>(`/invoices/${encodeURIComponent(invoiceId)}`);
}

export async function downloadInvoiceCsv(invoiceId: string) {
  await downloadAuthenticatedFile(
    `/invoices/${encodeURIComponent(invoiceId)}/export.csv`,
    `invoice-${invoiceId}.csv`
  );
}

export async function patchInvoiceStatus(invoiceId: string, status: string) {
  return apiClient.patch<{ ok: boolean; status: string }>(
    `/invoices/${encodeURIComponent(invoiceId)}/status`,
    { status }
  );
}

export async function generateInvoiceStub(invoiceId: string) {
  return apiClient.post<{
    ok: boolean;
    pdfGenerated: boolean;
    message: string;
    invoiceId: string;
  }>(`/invoices/${encodeURIComponent(invoiceId)}/generate`, {});
}
