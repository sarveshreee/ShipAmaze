import type { Order } from "@/types/logistics";
import { DEFAULT_LABEL_INVOICE_SETTINGS, type LabelInvoiceSettings } from "@/types/labelInvoice";
import {
  createOrderLabelElement,
  downloadOrderLabelPdf,
  openPrintWindowForLabel,
  openPrintWindowForLabelNodes,
} from "@/components/orderLabelDom";

export function printShippingLabel(order: Order, settings?: LabelInvoiceSettings) {
  openPrintWindowForLabel(order, settings ?? DEFAULT_LABEL_INVOICE_SETTINGS, `Shipping label · ${order.id}`);
}

export function printBulkLabels(orders: Order[], settings?: LabelInvoiceSettings) {
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  const nodes = orders.map((o) => createOrderLabelElement(o, s, { documentTitle: "Shipping label" }));
  openPrintWindowForLabelNodes(nodes, s, "Bulk shipping labels");
}

export function printBulkInvoices(orders: Order[], settings?: LabelInvoiceSettings) {
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  const nodes = orders.map((o) => createOrderLabelElement(o, s, { documentTitle: "Invoice" }));
  openPrintWindowForLabelNodes(nodes, s, "Bulk invoices");
}

export async function downloadShippingLabelPdf(order: Order, settings?: LabelInvoiceSettings) {
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  await downloadOrderLabelPdf(order, s, `label-${order.id}.pdf`, "Shipping label");
}

export async function downloadInvoicePdf(order: Order, settings?: LabelInvoiceSettings) {
  const s = settings ?? DEFAULT_LABEL_INVOICE_SETTINGS;
  await downloadOrderLabelPdf(order, s, `invoice-${order.id}.pdf`, "Invoice");
}
