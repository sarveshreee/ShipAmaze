import type { Order } from "@/types/logistics";
import { DEFAULT_LABEL_INVOICE_SETTINGS, type LabelInvoiceSettings } from "@/types/labelInvoice";
import {
  createOrderLabelElement,
  downloadOrderLabelPdf,
  openLabelNodesAsPdf,
} from "@/components/orderLabelDom";
import { toast } from "sonner";
import { getStoredToken } from "@/lib/apiClient";

function isAmazonTransportation(order: Order): boolean {
  return /amazon/i.test(String(order.courierName || order.courier || ""));
}

function getApiBase(): string {
  const u = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (u) { const n = u.replace(/\/$/, ""); return /\/api$/i.test(n) ? n : `${n}/api`; }
  if (import.meta.env.DEV) return "http://localhost:5000/api";
  return "";
}

async function openAmazonLabelPdf(order: Order): Promise<void> {
  const url = `${getApiBase()}/velocity/label-pdf/${encodeURIComponent(order.id)}`;
  const token = getStoredToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = "Amazon label unavailable";
    try { const j = JSON.parse(text); msg = j.message || msg; } catch { if (text) msg = text.slice(0, 200); }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const tab = window.open(blobUrl, "_blank");
  if (!tab) throw new Error("Popup blocked — please allow popups for this site");
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export function printShippingLabel(order: Order, settings?: LabelInvoiceSettings) {
  if (isAmazonTransportation(order)) {
    openAmazonLabelPdf(order).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to open Amazon label");
    });
    return;
  }
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  const node = createOrderLabelElement(order, s, { documentTitle: `Shipping label · ${order.id}` });
  openLabelNodesAsPdf([node], s, `Shipping label · ${order.id}`).catch((e: unknown) => {
    toast.error(e instanceof Error ? e.message : "Failed to open label PDF");
  });
}

export function printBulkLabels(orders: Order[], settings?: LabelInvoiceSettings) {
  const s = { ...(settings ?? DEFAULT_LABEL_INVOICE_SETTINGS), labelSize: "4x6" as const };
  const nodes = orders.map((o) => createOrderLabelElement(o, s, { documentTitle: "Shipping label" }));
  openLabelNodesAsPdf(nodes, s, "Bulk shipping labels").catch((e: unknown) => {
    toast.error(e instanceof Error ? e.message : "Failed to open bulk label PDF");
  });
}

export function printBulkInvoices(orders: Order[], settings?: LabelInvoiceSettings) {
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  const nodes = orders.map((o) => createOrderLabelElement(o, s, { documentTitle: "Invoice" }));
  openLabelNodesAsPdf(nodes, s, "Bulk invoices").catch((e: unknown) => {
    toast.error(e instanceof Error ? e.message : "Failed to open invoice PDF");
  });
}

export async function downloadShippingLabelPdf(order: Order, settings?: LabelInvoiceSettings) {
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  await downloadOrderLabelPdf(order, s, `label-${order.id}.pdf`, "Shipping label");
}

export async function downloadInvoicePdf(order: Order, settings?: LabelInvoiceSettings) {
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  await downloadOrderLabelPdf(order, s, `invoice-${order.id}.pdf`, "Invoice");
}
