import type { Order } from "@/types/logistics";
import { DEFAULT_LABEL_INVOICE_SETTINGS, type LabelInvoiceSettings } from "@/types/labelInvoice";
import {
  createOrderLabelElement,
  displayOrderNumber,
  downloadOrderLabelPdf,
  openPrintWindowForLabel,
  openPrintWindowForLabelNodes,
  renderLabelNodesToPdfBlob,
} from "@/components/orderLabelDom";
import { shouldUseVelocityCourierPdf } from "@/lib/labelPrintUtils";
import { toast } from "sonner";
import { getStoredToken } from "@/lib/apiClient";
import * as labelInvoiceSettingsService from "@/services/labelInvoiceSettingsService";

const BULK_FETCH_TIMEOUT_MS = 300_000;
const MAX_STYLED_BULK_LABELS = 1000;

function getApiBase(): string {
  const u = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (u) {
    const n = u.replace(/\/$/, "");
    return /\/api$/i.test(n) ? n : `${n}/api`;
  }
  if (import.meta.env.DEV) return "/api";
  return "";
}

function downloadPdfFile(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

function openPdfBlob(blob: Blob, existingTab?: Window | null): void {
  const blobUrl = URL.createObjectURL(blob);
  if (existingTab && !existingTab.closed) {
    existingTab.location.href = blobUrl;
  } else {
    const tab = window.open(blobUrl, "_blank");
    if (!tab) {
      URL.revokeObjectURL(blobUrl);
      // Fall back to direct download when popups are blocked.
      downloadPdfFile(blob, `labels-${Date.now()}.pdf`);
      return;
    }
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
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
    throw new Error(
      `${msg} — Amazon Transportation always uses the official Velocity PDF (same as Velocity panel). ` +
        "Re-process or open the label once in Velocity if the S3 URL expired."
    );
  }
  return res.blob();
}

async function openCourierLabelPdf(order: Order): Promise<void> {
  // Official Amazon/Velocity label — download the PDF file (no about:blank HTML window).
  downloadPdfFile(await fetchCourierLabelPdfBlob(order), `amazon-label-${displayOrderNumber(order)}.pdf`);
}

/** Load global (or dropshipper-merged) settings, then apply per-order logos when present. */
async function resolveSettingsForOrders(
  orders: Order[],
  settings?: LabelInvoiceSettings
): Promise<{ base: LabelInvoiceSettings; logos: Record<string, string> }> {
  let base = settings;
  if (!base) {
    try {
      base = await labelInvoiceSettingsService.getLabelInvoiceSettings();
    } catch {
      base = DEFAULT_LABEL_INVOICE_SETTINGS;
    }
  }
  let logos: Record<string, string> = {};
  try {
    logos = await labelInvoiceSettingsService.resolveOrderLabelLogos(orders.map((o) => o.id));
  } catch (err) {
    console.warn("[label] resolve logos failed", err instanceof Error ? err.message : err);
  }
  return { base, logos };
}

function settingsForOrder(
  base: LabelInvoiceSettings,
  order: Order,
  logos: Record<string, string>
): LabelInvoiceSettings {
  const custom = logos[order.id]?.trim();
  if (!custom) return base;
  return { ...base, logoUrl: custom, showLogo: true };
}

export async function printShippingLabel(order: Order, settings?: LabelInvoiceSettings): Promise<void> {
  if (shouldUseVelocityCourierPdf(order)) {
    await openCourierLabelPdf(order);
    return;
  }
  const { base, logos } = await resolveSettingsForOrders([order], settings);
  const s = settingsForOrder(base, order, logos);
  openPrintWindowForLabel(order, s, `Shipping label · ${displayOrderNumber(order)}`);
}

export async function printBulkLabels(orders: Order[], settings?: LabelInvoiceSettings): Promise<void> {
  if (!orders.length) return;

  const amazonOrders = orders.filter((o) => shouldUseVelocityCourierPdf(o));
  const styledOrders = orders.filter((o) => !shouldUseVelocityCourierPdf(o));

  if (styledOrders.length > MAX_STYLED_BULK_LABELS) {
    throw new Error(`Print at most ${MAX_STYLED_BULK_LABELS} styled labels at a time.`);
  }

  const pdfParts: Blob[] = [];
  let warnings: string | undefined;

  try {
    if (amazonOrders.length > 0) {
      // Official Velocity Amazon PDFs — download as a file, never open an HTML print window.
      const amazonResult = await fetchBulkCourierLabelPdf(amazonOrders.map((o) => o.id));
      pdfParts.push(amazonResult.blob);
      warnings = amazonResult.warnings;
    }

    if (styledOrders.length > 0) {
      const { base, logos } = await resolveSettingsForOrders(styledOrders, settings);
      const s = { ...base, labelSize: "4x6" as const };
      const nodes = styledOrders.map((o) =>
        createOrderLabelElement(o, settingsForOrder(s, o, logos), { documentTitle: "Shipping label" })
      );
      pdfParts.push(await renderLabelNodesToPdfBlob(nodes, s));
    }

    const merged = await mergePdfBlobs(pdfParts);
    if (amazonOrders.length > 0 && styledOrders.length === 0) {
      downloadPdfFile(merged, `amazon-labels-${amazonOrders.length}.pdf`);
    } else if (amazonOrders.length > 0) {
      downloadPdfFile(merged, `labels-${orders.length}.pdf`);
    } else {
      openPdfBlob(merged);
    }

    if (warnings) {
      const short = warnings.length > 220 ? `${warnings.slice(0, 220)}…` : warnings;
      toast.warning(short);
    }
  } catch (err: unknown) {
    throw err instanceof Error ? err : new Error("Bulk label print failed");
  }
}

export async function printBulkInvoices(orders: Order[], settings?: LabelInvoiceSettings): Promise<void> {
  if (orders.length > MAX_STYLED_BULK_LABELS) {
    throw new Error(`Print at most ${MAX_STYLED_BULK_LABELS} invoices at a time.`);
  }
  if (!orders.length) return;

  // Amazon Transportation → official Velocity courier PDF download (same design as Velocity panel).
  const amazonOrders = orders.filter((o) => shouldUseVelocityCourierPdf(o));
  const styledOrders = orders.filter((o) => !shouldUseVelocityCourierPdf(o));

  if (amazonOrders.length > 0) {
    try {
      if (styledOrders.length === 0) {
        const amazonResult = await fetchBulkCourierLabelPdf(amazonOrders.map((o) => o.id));
        downloadPdfFile(amazonResult.blob, `amazon-labels-${amazonOrders.length}.pdf`);
        if (amazonResult.warnings) {
          const short =
            amazonResult.warnings.length > 220
              ? `${amazonResult.warnings.slice(0, 220)}…`
              : amazonResult.warnings;
          toast.warning(short);
        }
        return;
      }
      await printBulkLabels(orders, settings);
      return;
    } catch (err: unknown) {
      throw err instanceof Error ? err : new Error("Bulk Amazon label download failed");
    }
  }

  // Non-Amazon: HTML print window (seconds).
  const { base, logos } = await resolveSettingsForOrders(orders, settings);
  const nodes = orders.map((o) =>
    createOrderLabelElement(o, settingsForOrder(base, o, logos), { documentTitle: "Invoice" })
  );
  openPrintWindowForLabelNodes(nodes, base, "Bulk invoices");
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
  const { base, logos } = await resolveSettingsForOrders([order], settings);
  const s = settingsForOrder(base, order, logos);
  // Fast high-res path: open native print preview (Save as PDF). Avoids slow html2canvas.
  openPrintWindowForLabel(order, s, `Shipping label · ${displayOrderNumber(order)}`);
}

export async function downloadInvoicePdf(order: Order, settings?: LabelInvoiceSettings) {
  // Amazon Transportation → official Velocity courier PDF (same design as Velocity panel).
  // Never generate ShipAmaze HTML for Amazon — that was the recurring wrong-invoice bug.
  if (shouldUseVelocityCourierPdf(order)) {
    const blob = await fetchCourierLabelPdfBlob(order);
    downloadPdfFile(blob, `amazon-invoice-${displayOrderNumber(order)}.pdf`);
    return;
  }
  const { base, logos } = await resolveSettingsForOrders([order], settings);
  const s = settingsForOrder(base, order, logos);
  await downloadOrderLabelPdf(order, s, `invoice-${order.id}.pdf`, "Invoice");
}
