import JsBarcode from "jsbarcode";
import type { Order } from "@/types/logistics";
import type { LabelInvoiceSettings, LabelSizePreset } from "@/types/labelInvoice";
import { getFinalLineItemUnitPrice, getFinalLineItemRowTotal } from "@/lib/pricing";

type Line = Record<string, unknown>;

function dash(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  return s || "—";
}

function orderLines(order: Order): Line[] {
  const raw = (order as { orderItems?: unknown[]; items?: unknown[] }).orderItems
    ?? order.items
    ?? order.products
    ?? [];
  return Array.isArray(raw) ? (raw as Line[]) : [];
}

function lineName(line: Line): string {
  return dash(line.name ?? line.title);
}

function lineQty(line: Line): string {
  const q = Number(line.qty ?? line.quantity ?? line.units ?? 0);
  if (!Number.isFinite(q) || q < 1) return "—";
  return String(Math.floor(q));
}

function lineUnitPrice(line: Line): string {
  const p = getFinalLineItemUnitPrice(line);
  if (!Number.isFinite(p)) return "—";
  return String(p);
}

function lineProductCode(line: Line): string {
  return dash(
    line.productCode ??
      line.code ??
      line.productId ??
      line.variant_id ??
      line.variantSku ??
      line.sku ??
      line.SKU ??
      line.productSku
  );
}

function orderRateCardShipping(order: Order): number {
  const n = Number((order as { shippingCharges?: number }).shippingCharges ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatMoneyAmount(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
}

function lineInvoiceRowTotal(line: Line, order: Order, lineIndex: number, lineCount: number): string {
  let total = getFinalLineItemRowTotal(line);
  if (lineIndex === lineCount - 1) {
    total += orderRateCardShipping(order);
  }
  return formatMoneyAmount(total);
}

function orderCollectableTotal(order: Order): number {
  const productTotal = orderLines(order).reduce((sum, line) => sum + getFinalLineItemRowTotal(line), 0);
  const amount = Number(order.amount ?? 0);
  const base = productTotal > 0 ? productTotal : Number.isFinite(amount) && amount > 0 ? amount : 0;
  return Math.round((base + orderRateCardShipping(order)) * 100) / 100;
}

function lineSku(line: Line): string {
  return dash(line.sku ?? line.SKU ?? line.productSku);
}

function lineRowTotal(line: Line): string {
  const t = getFinalLineItemRowTotal(line);
  if (!Number.isFinite(t)) return "—";
  return String(t);
}

function paymentLabel(order: Order): "COD" | "Prepaid" {
  const p = String(order.payment ?? "").toUpperCase();
  return p === "COD" ? "COD" : "Prepaid";
}

function barcodePngDataUrl(value: string): string | null {
  const v = value.trim();
  if (!v || v === "—") return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, v, {
      format: "CODE128",
      width: 2,
      height: 56,
      displayValue: true,
      fontSize: 11,
      margin: 2,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function labelPageSizeCss(size: LabelSizePreset): { page: string; width: string; minHeight: string } {
  switch (size) {
    case "A6":
      return { page: "105mm 148mm", width: "100%", minHeight: "148mm" };
    case "A5":
      return { page: "148mm 210mm", width: "100%", minHeight: "210mm" };
    case "4x6":
    default:
      return { page: "4in 6in", width: "4in", minHeight: "6in" };
  }
}

function labelPixelBox(size: LabelSizePreset): { w: number; h: number } {
  switch (size) {
    case "A6":
      return { w: 397, h: 561 };
    case "A5":
      return { w: 559, h: 794 };
    case "4x6":
    default:
      return { w: 384, h: 576 };
  }
}

function dimsText(order: Order): string {
  if (order.dimensions?.trim()) return order.dimensions.trim();
  const L = order.length;
  const W = order.width ?? order.breadth;
  const H = order.height;
  if (L && W && H) return `${L}×${W}×${H} CM`;
  return "—";
}

function weightLine(order: Order): string {
  const wv = String(order.weight ?? "").trim();
  if (!wv) return "Weight: —";
  if (/kg\s*$/i.test(wv) || /\bkg\b/i.test(wv)) return `Weight: ${wv}`;
  return `Weight: ${wv} KG`;
}

function shipBlock(order: Order): { name: string; lines: string[]; phone: string } {
  const name = dash(order.customer);
  const parts = [
    dash(order.shippingAddress1 || order.address),
    dash(order.shippingAddress2),
    [dash(order.shippingCity || order.city), dash(order.shippingState || order.state), dash(order.shippingPincode || order.pincode)]
      .filter((x) => x !== "—")
      .join(", "),
  ].filter((x) => x !== "—");
  const phone = dash(order.customerPhone || order.phone);
  return { name, lines: parts, phone };
}

export function labelPdfDimensionsMm(size: LabelSizePreset): { w: number; h: number } {
  switch (size) {
    case "A6":
      return { w: 105, h: 148 };
    case "A5":
      return { w: 148, h: 210 };
    case "4x6":
    default:
      return { w: 101.6, h: 152.4 };
  }
}

const SECTION_BORDER = "1px solid #000";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: { className?: string; style?: Partial<CSSStyleDeclaration>; text?: string }
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts?.className) node.className = opts.className;
  if (opts?.style) Object.assign(node.style, opts.style);
  if (opts?.text != null) node.textContent = opts.text;
  return node;
}

/**
 * Builds a print/PDF-ready label (white background, black borders) from real order data only.
 */
export function createOrderLabelElement(
  order: Order,
  settings: LabelInvoiceSettings,
  opts?: { documentTitle?: string }
): HTMLElement {
  const lines = orderLines(order);
  const page = labelPageSizeCss(settings.labelSize);
  const px = labelPixelBox(settings.labelSize);

  const host = el("div", {
    className: "shipamaze-order-label",
    style: {
      boxSizing: "border-box",
      width: `${px.w}px`,
      minHeight: `${px.h}px`,
      padding: "10px 12px",
      background: "#ffffff",
      color: "#000000",
      fontFamily: "system-ui, Segoe UI, Arial, sans-serif",
      fontSize: "11px",
      lineHeight: "1.35",
      colorScheme: "light",
    },
  });

  const row = (children: HTMLElement[], style?: Partial<CSSStyleDeclaration>) => {
    const r = el("div", {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: "8px",
        borderBottom: SECTION_BORDER,
        padding: "8px 0",
        ...style,
      },
    });
    children.forEach((c) => r.appendChild(c));
    return r;
  };

  const block = (title: string, bodyLines: string[]) => {
    const wrap = el("div", { style: { flex: "1", minWidth: "0" } });
    const t = el("div", {
      style: { fontWeight: "700", fontSize: "10px", marginBottom: "4px", textTransform: "uppercase" },
      text: title,
    });
    wrap.appendChild(t);
    for (const line of bodyLines) {
      wrap.appendChild(el("div", { text: line }));
    }
    return wrap;
  };

  // --- Header: seller | logo ---
  const brandLabel = settings.showBrandName
    ? dash(settings.brandName || settings.companyName)
    : "—";
  const sellerLines = settings.hidePickupAddress
    ? []
    : [
        brandLabel !== "—" ? brandLabel : dash(settings.companyName),
        ...String(settings.address || "")
          .split(/\n|,/)
          .map((s) => s.trim())
          .filter(Boolean),
      ].filter((x) => x !== "—");
  const sellerBlock = block("From (Seller)", sellerLines.length ? sellerLines : (settings.hidePickupAddress ? ["(hidden)"] : ["—"]));

  const logoCell = el("div", {
    style: {
      width: "120px",
      flexShrink: "0",
      textAlign: "right",
      minHeight: "48px",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
    },
  });
  const lu = settings.showLogo ? settings.logoUrl?.trim() : "";
  if (lu && (lu.startsWith("http") || lu.startsWith("data:"))) {
    const img = document.createElement("img");
    img.src = lu;
    img.alt = "Logo";
    img.style.maxHeight = "48px";
    img.style.maxWidth = "110px";
    img.style.objectFit = "contain";
    logoCell.appendChild(img);
  } else {
    logoCell.appendChild(el("span", { style: { fontSize: "10px", color: "#666" }, text: "Logo" }));
  }
  host.appendChild(row([sellerBlock, logoCell], { alignItems: "stretch" as const }));

  // --- Ship to ---
  const st = shipBlock(order);
  const shipInner = el("div", { style: { flex: "1" } });
  shipInner.appendChild(el("div", { style: { fontWeight: "700", fontSize: "10px", marginBottom: "4px" }, text: "Deliver To" }));
  shipInner.appendChild(el("div", { style: { fontWeight: "700" }, text: st.name }));
  st.lines.forEach((ln) => shipInner.appendChild(el("div", { text: ln })));
  if (st.phone !== "—" && !settings.hideCustomerMobile) {
    shipInner.appendChild(el("div", { text: `Phone: ${st.phone}` }));
  }
  host.appendChild(row([shipInner]));

  const extraBlocks: string[] = [];
  if (!settings.hideWarehouseAddress && settings.warehouseAddress.trim()) {
    extraBlocks.push(`Warehouse: ${settings.warehouseAddress.trim()}`);
  }
  if (!settings.hideWarehouseMobile && settings.warehouseMobile.trim()) {
    extraBlocks.push(`Warehouse phone: ${settings.warehouseMobile.trim()}`);
  }
  if (!settings.hideReturnAddress && settings.returnAddress.trim()) {
    extraBlocks.push(`Return: ${settings.returnAddress.trim()}`);
  }
  if (!settings.hideReturnMobile && settings.returnMobile.trim()) {
    extraBlocks.push(`Return phone: ${settings.returnMobile.trim()}`);
  }
  if (settings.showGstAddress && settings.gstAddress.trim()) {
    extraBlocks.push(`GST: ${settings.gstAddress.trim()}`);
  }
  if (extraBlocks.length) {
    host.appendChild(row([block("Additional", extraBlocks)]));
  }

  // --- Dims / AWB ---
  const leftMeta = el("div", { style: { flex: "1", minWidth: "0" } });
  leftMeta.appendChild(el("div", { text: `Dimensions: ${dimsText(order)}` }));
  if (settings.showWeight) {
    leftMeta.appendChild(el("div", { style: { marginTop: "4px", fontWeight: "600" }, text: weightLine(order) }));
  }

  const rightAwb = el("div", { style: { flex: "1", minWidth: "0", textAlign: "right" } });
  const awbVal = dash(order.awb || order.trackingId || order.velocityShipmentId);
  rightAwb.appendChild(el("div", { style: { fontWeight: "700", marginBottom: "4px" }, text: `AWB: ${awbVal}` }));
  if (settings.showBarcode && awbVal !== "—") {
    const src = barcodePngDataUrl(awbVal);
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      rightAwb.appendChild(img);
    } else {
      rightAwb.appendChild(el("div", { style: { fontFamily: "monospace", letterSpacing: "2px" }, text: awbVal }));
    }
  } else {
    rightAwb.appendChild(el("div", { style: { fontFamily: "monospace" }, text: awbVal }));
  }
  const routing = dash(order.zone);
  rightAwb.appendChild(
    el("div", { style: { marginTop: "6px", fontSize: "10px", fontWeight: "600" }, text: `Routing Code: ${routing}` })
  );
  host.appendChild(row([leftMeta, rightAwb]));

  // --- Payment / Courier ---
  const pay = paymentLabel(order);
  const collectable = orderCollectableTotal(order);
  const codText =
    pay === "COD"
      ? settings.showCodValue
        ? `COD (Collectable Value: Rs. ${collectable})`
        : "COD"
      : "Prepaid";
  const payCell = el("div", { style: { flex: "1", fontWeight: "700" }, text: codText });
  const courierCell = el("div", {
    style: { flex: "1", textAlign: "right", fontWeight: "800", fontSize: "13px", letterSpacing: "0.5px" },
    text: String(order.courierName || order.courier || "—").toUpperCase(),
  });
  host.appendChild(row([payCell, courierCell]));

  const shipCharge = orderRateCardShipping(order);
  if (shipCharge > 0) {
    const billRow = el("div", {
      style: {
        borderBottom: SECTION_BORDER,
        padding: "6px 0",
        fontSize: "10px",
        display: "flex",
        justifyContent: "space-between",
        fontWeight: "600",
      },
    });
    billRow.appendChild(el("span", { text: "Shipping Charge (Rate Card)" }));
    billRow.appendChild(el("span", { text: `Rs. ${shipCharge.toFixed(2)}` }));
    host.appendChild(billRow);
  }

  // --- Important note ---
  if (settings.invoiceNote.trim()) {
    const note = el("div", {
      style: {
        borderBottom: SECTION_BORDER,
        padding: "8px 0",
        fontSize: "10px",
      },
    });
    note.appendChild(el("span", { style: { fontWeight: "700" }, text: "Important: " }));
    note.appendChild(document.createTextNode(settings.invoiceNote.trim()));
    host.appendChild(note);
  }

  // --- Order summary row ---
  const distinctSku = new Set(lines.map((l) => lineSku(l)).filter((s) => s !== "—"));
  const numSkus = distinctSku.size > 0 ? distinctSku.size : lines.length || 0;
  const totalQty = lines.reduce((acc, l) => {
    const q = Number(l.qty ?? l.quantity ?? l.units ?? 0);
    return acc + (Number.isFinite(q) && q > 0 ? q : 0);
  }, 0);

  const sumLeft = el("div", { style: { flex: "1" }, text: `Number of SKUs: ${numSkus || "—"}` });
  const sumMid = el("div", { style: { flex: "1", textAlign: "center" }, text: `Total Quantity: ${totalQty || "—"}` });
  const sumRight = el("div", { style: { flex: "1", textAlign: "right", minWidth: "0" } });
  sumRight.appendChild(el("div", { style: { fontWeight: "700", fontSize: "10px" }, text: `Order Id: ${dash(order.id)}` }));
  if (settings.showBarcode && dash(order.id) !== "—") {
    const src = barcodePngDataUrl(String(order.id));
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.style.maxWidth = "140px";
      img.style.marginTop = "4px";
      img.style.marginLeft = "auto";
      img.style.display = "block";
      sumRight.appendChild(img);
    }
  }
  host.appendChild(row([sumLeft, sumMid, sumRight]));

  // --- Product table ---
  if (settings.showProductTable && lines.length > 0) {
    const tableWrap = el("div", { style: { borderBottom: SECTION_BORDER, padding: "8px 0" } });
    const tbl = document.createElement("table");
    tbl.style.width = "100%";
    tbl.style.borderCollapse = "collapse";
    tbl.style.fontSize = "10px";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const headers: string[] = [];
    if (settings.showProductName) headers.push("Product Name");
    headers.push("Product Code", "SKU ID", "Qty", "Total Price");
    for (const h of headers) {
      const th = document.createElement("th");
      th.textContent = h;
      th.style.border = "1px solid #000";
      th.style.padding = "4px";
      th.style.textAlign = "left";
      th.style.fontWeight = "700";
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    tbl.appendChild(thead);
    const tb = document.createElement("tbody");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const tr = document.createElement("tr");
      const cells: string[] = [];
      if (settings.showProductName) cells.push(lineName(line));
      cells.push(lineProductCode(line), lineSku(line), lineQty(line), lineInvoiceRowTotal(line, order, i, lines.length));
      for (const c of cells) {
        const td = document.createElement("td");
        td.textContent = c;
        td.style.border = "1px solid #000";
        td.style.padding = "4px";
        td.style.verticalAlign = "top";
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    tableWrap.appendChild(tbl);
    host.appendChild(tableWrap);
  }

  // --- Footer ---
  if (settings.footerNote.trim()) {
    host.appendChild(
      el("div", {
        style: { padding: "8px 0", fontSize: "9px", borderBottom: SECTION_BORDER },
        text: `NOTE: ${settings.footerNote.trim()}`,
      })
    );
  }

  host.appendChild(
    el("div", {
      style: { padding: "6px 0 0", fontSize: "8px", color: "#444", textAlign: "center" },
      text: opts?.documentTitle ? `Powered by ShipAmaze · ${opts.documentTitle}` : "Powered by ShipAmaze",
    })
  );

  host.dataset.pageSize = page.page;
  host.dataset.pageWidth = page.width;
  host.dataset.pageMinHeight = page.minHeight;

  return host;
}

export function openPrintWindowForLabel(order: Order, settings: LabelInvoiceSettings, title: string): void {
  openPrintWindowForLabelNodes([createOrderLabelElement(order, settings, { documentTitle: title })], settings, title);
}

/** Multiple labels in one print dialog (page breaks between orders). */
export function openPrintWindowForLabelNodes(
  nodes: HTMLElement[],
  settings: LabelInvoiceSettings,
  title: string
): void {
  const page = labelPageSizeCss(settings.labelSize);
  const styles = `
    @page { size: ${page.page}; margin: 4mm; }
    html, body { margin: 0; padding: 0; background: #fff !important; color: #000 !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .shipamaze-order-label { margin: 0 auto; page-break-after: always; }
    .shipamaze-order-label:last-child { page-break-after: auto; }
  `;
  const w = window.open("", "_blank", "width=520,height=760");
  if (!w) return;
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body></body></html>`);
  w.document.close();
  for (const node of nodes) {
    w.document.body.appendChild(w.document.importNode(node, true));
  }
  w.setTimeout(() => {
    w.focus();
    w.print();
  }, 250);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function downloadOrderLabelPdf(
  order: Order,
  settings: LabelInvoiceSettings,
  filename: string,
  documentTitle = "Label"
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const el = createOrderLabelElement(order, settings, { documentTitle });
  el.style.position = "fixed";
  el.style.left = "0";
  el.style.top = "0";
  el.style.zIndex = "0";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const mm = labelPdfDimensionsMm(settings.labelSize);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [mm.w, mm.h] });
    const img = canvas.toDataURL("image/png");
    pdf.addImage(img, "PNG", 0, 0, mm.w, mm.h, undefined, "FAST");
    pdf.save(filename);
  } finally {
    document.body.removeChild(el);
  }
}

/**
 * Non-persisted sample order for admin label preview only (layout / typography check).
 * Not used for production labels or stored orders.
 */
export function getLabelPreviewSampleOrder(): Order {
  return {
    id: "PREVIEW-ORDER-ID",
    customer: "Recipient (preview)",
    phone: "0000000000",
    address: "Preview delivery address line",
    city: "Preview City",
    state: "Preview State",
    pincode: "000000",
    weight: "0.40",
    length: 12,
    width: 12,
    height: 12,
    courier: "Delhivery",
    courierName: "Delhivery",
    payment: "COD",
    status: "in-transit",
    date: new Date().toISOString().slice(0, 10),
    awb: "PREVIEW-AWB-00000000",
    amount: 499,
    products: [
      {
        name: "Preview product row (layout sample only)",
        qty: 1,
        price: 499,
        weight: "0.40",
        sku: "PREVIEW-SKU",
        productCode: "preview-code",
      },
    ],
    dimensions: "12×12×12 CM",
    zone: "PREVIEW/RT",
    shippingAddress1: "Preview delivery address line",
    shippingCity: "Preview City",
    shippingState: "Preview State",
    shippingPincode: "000000",
  };
}
