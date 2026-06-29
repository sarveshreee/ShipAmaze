import type { Order } from "@/types/logistics";
import { DEFAULT_LABEL_INVOICE_SETTINGS, type LabelInvoiceSettings } from "@/types/labelInvoice";
import {
  createOrderLabelElement,
  displayOrderNumber,
  downloadOrderLabelPdf,
  openLabelNodesAsPdf,
  renderLabelNodesToPdfBlob,
} from "@/components/orderLabelDom";
import { shouldUseVelocityCourierPdf } from "@/lib/labelPrintUtils";
import { toast } from "sonner";
import { getStoredToken } from "@/lib/apiClient";

const BULK_FETCH_TIMEOUT_MS = 120_000;
const MAX_STYLED_BULK_LABELS = 50;

function getApiBase(): string {
  const u = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (u) {
    const n = u.replace(/\/$/, "");
    return /\/api$/i.test(n) ? n : `${n}/api`;
  }
  if (import.meta.env.DEV) return "http://localhost:5000/api";
  return "";
}

function openPdfBlob(blob: Blob, existingTab?: Window | null): void {
  const blobUrl = URL.createObjectURL(blob);
  if (existingTab && !existingTab.closed) {
    existingTab.location.href = blobUrl;
  } else {
    const tab = window.open(blobUrl, "_blank");
    if (!tab) {
      URL.revokeObjectURL(blobUrl);
      throw new Error("Popup blocked — please allow popups for this site");
    }
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
}

function openPreparingTab(count: number): Window | null {
  const tab = window.open("", "_blank");
  if (!tab) return null;
  tab.document.open();
  tab.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Labels</title></head><body style="font-family:system-ui,sans-serif;padding:32px;color:#333"><h2>Preparing ${count} label(s)…</h2><p>Please wait — do not close this tab.</p></body></html>`
  );
  tab.document.close();
  return tab;
}

function summarizeBulkLabelError(message: string): string {
  const parts = message.split(/;\s*/).filter(Boolean);
  if (parts.length <= 2) return message;
  const sample = parts.slice(0, 2).join("; ");
  return `${parts.length} labels failed. ${sample}…`;
}

async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) return blobs[0]!;
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();
  for (const blob of blobs) {
    const src = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return new Blob([new Uint8Array(await merged.save())], { type: "application/pdf" });
}

async function fetchBulkCourierLabelPdf(orderIds: string[]): Promise<{ blob: Blob; warnings?: string }> {
  const url = `${getApiBase()}/velocity/label-pdf/bulk`;
  const token = getStoredToken();
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), BULK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ orderIds }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = "Bulk label download failed";
      if (res.status === 404) {
        msg = "Bulk label API not found — restart/update the backend server and try again.";
      }
      try {
        const j = JSON.parse(text) as { message?: string };
        msg = j.message ? summarizeBulkLabelError(j.message) : msg;
      } catch {
        if (text) msg = text.slice(0, 300);
      }
      throw new Error(msg);
    }
    return {
      blob: await res.blob(),
      warnings: res.headers.get("X-Label-Warnings") ?? undefined,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Bulk label request timed out. Try fewer orders or retry after restarting the backend.");
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchCourierLabelPdfBlob(order: Order): Promise<Blob> {
  const url = `${getApiBase()}/velocity/label-pdf/${encodeURIComponent(order.id)}`;
  const token = getStoredToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = "Courier label unavailable";
    try {
      const j = JSON.parse(text) as { message?: string };
      msg = j.message || msg;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.blob();
}

async function openCourierLabelPdf(order: Order): Promise<void> {
  openPdfBlob(await fetchCourierLabelPdfBlob(order));
}

async function openStyledLabelPdf(order: Order, settings?: LabelInvoiceSettings): Promise<void> {
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  const visibleOrderNumber = displayOrderNumber(order);
  const node = createOrderLabelElement(order, s, { documentTitle: `Shipping label · ${visibleOrderNumber}` });
  await openLabelNodesAsPdf([node], s, `Shipping label · ${visibleOrderNumber}`);
}

export function printShippingLabel(order: Order, settings?: LabelInvoiceSettings) {
  if (shouldUseVelocityCourierPdf(order)) {
    openCourierLabelPdf(order).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to open Amazon courier label");
    });
    return;
  }
  openStyledLabelPdf(order, settings).catch((e: unknown) => {
    toast.error(e instanceof Error ? e.message : "Failed to open label PDF");
  });
}

export async function printBulkLabels(orders: Order[], settings?: LabelInvoiceSettings): Promise<void> {
  if (!orders.length) return;

  const amazonOrders = orders.filter((o) => shouldUseVelocityCourierPdf(o));
  const styledOrders = orders.filter((o) => !shouldUseVelocityCourierPdf(o));

  if (styledOrders.length > MAX_STYLED_BULK_LABELS) {
    throw new Error(`Print at most ${MAX_STYLED_BULK_LABELS} styled labels at a time.`);
  }

  const prepTab = openPreparingTab(orders.length);
  const pdfParts: Blob[] = [];
  let warnings: string | undefined;

  try {
    if (amazonOrders.length > 0) {
      const amazonResult = await fetchBulkCourierLabelPdf(amazonOrders.map((o) => o.id));
      pdfParts.push(amazonResult.blob);
      warnings = amazonResult.warnings;
    }

    if (styledOrders.length > 0) {
      const s = { ...(settings ?? DEFAULT_LABEL_INVOICE_SETTINGS), labelSize: "4x6" as const };
      const nodes = styledOrders.map((o) => createOrderLabelElement(o, s, { documentTitle: "Shipping label" }));
      pdfParts.push(await renderLabelNodesToPdfBlob(nodes, s));
    }

    const merged = await mergePdfBlobs(pdfParts);
    openPdfBlob(merged, prepTab);

    if (warnings) {
      const short = warnings.length > 220 ? `${warnings.slice(0, 220)}…` : warnings;
      toast.warning(short);
    }
  } catch (err: unknown) {
    if (prepTab && !prepTab.closed) prepTab.close();
    throw err instanceof Error ? err : new Error("Bulk label print failed");
  }
}

export async function printBulkInvoices(orders: Order[], settings?: LabelInvoiceSettings): Promise<void> {
  if (orders.length > MAX_STYLED_BULK_LABELS) {
    throw new Error(`Print at most ${MAX_STYLED_BULK_LABELS} invoices at a time.`);
  }
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  const nodes = orders.map((o) => createOrderLabelElement(o, s, { documentTitle: "Invoice" }));
  await openLabelNodesAsPdf(nodes, s, "Bulk invoices");
}

export async function downloadShippingLabelPdf(order: Order, settings?: LabelInvoiceSettings) {
  if (shouldUseVelocityCourierPdf(order)) {
    const blob = await fetchCourierLabelPdfBlob(order);
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `label-${displayOrderNumber(order)}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return;
  }
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  await downloadOrderLabelPdf(order, s, `label-${displayOrderNumber(order)}.pdf`, "Shipping label");
}

export async function downloadInvoicePdf(order: Order, settings?: LabelInvoiceSettings) {
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  await downloadOrderLabelPdf(order, s, `invoice-${order.id}.pdf`, "Invoice");
}
