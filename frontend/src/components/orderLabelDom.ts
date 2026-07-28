import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
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

function formatMoneyAmount(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
}

function lineInvoiceRowTotal(line: Line): string {
  return formatMoneyAmount(getFinalLineItemRowTotal(line));
}

function orderCollectableTotal(order: Order): number {
  const productTotal = orderLines(order).reduce((sum, line) => sum + getFinalLineItemRowTotal(line), 0);
  const amount = Number(order.amount ?? 0);
  const base = productTotal > 0 ? productTotal : Number.isFinite(amount) && amount > 0 ? amount : 0;
  return Math.round(base * 100) / 100;
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

export function displayOrderNumber(order: Order): string {
  const shopifyNumeric = String(order.shopifyOrderNumericId ?? "").trim();
  if (shopifyNumeric) return shopifyNumeric;

  const rawId = String(order.id ?? "").trim();
  const shopifyTail = /^shopify-.+-(\d{8,})$/i.exec(rawId);
  if (shopifyTail?.[1]) return shopifyTail[1];

  return rawId || "—";
}

/**
 * Generate a high-contrast CODE128 barcode PNG suitable for handheld scanners.
 * Quiet zones, module width, and PNG (not JPEG) matter for scan reliability after print/PDF.
 */
function barcodePngDataUrl(
  value: string,
  opts?: {
    height?: number;
    displayValue?: boolean;
    /** Module (bar) width in canvas px — higher = thicker/darker bars when printed. */
    moduleWidth?: number;
    /** Extra quiet-zone margin in canvas px. */
    margin?: number;
  }
): string | null {
  const v = value.trim();
  if (!v || v === "—") return null;
  try {
    const canvas = document.createElement("canvas");
    // High module width + pure black bars for dark, scannable AWB print.
    JsBarcode(canvas, v, {
      format: "CODE128",
      width: opts?.moduleWidth ?? 4,
      height: opts?.height ?? 96,
      displayValue: opts?.displayValue !== false,
      fontSize: 14,
      fontOptions: "bold",
      textMargin: 4,
      // Quiet zone ≥ 10× module width recommended for Code128 scanners
      margin: opts?.margin ?? 16,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[label:barcode] failed to encode", { value: v.slice(0, 48), error: err instanceof Error ? err.message : err });
    return null;
  }
}

function attachBarcodeImage(parent: HTMLElement, src: string, style?: Partial<CSSStyleDeclaration>) {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "Barcode";
  img.style.display = "block";
  // Pure black bars — avoid filters that wash to grey on print/PDF
  img.style.imageRendering = "pixelated";
  img.style.width = "100%";
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  img.style.objectFit = "contain";
  img.style.boxSizing = "border-box";
  img.style.background = "#ffffff";
  if (style) Object.assign(img.style, style);
  parent.appendChild(img);
}

/** Constrains barcode so it cannot spill past the label edge. */
function attachFittedBarcode(
  parent: HTMLElement,
  src: string,
  opts?: { maxWidth?: string; height?: string; align?: "left" | "center" | "right" }
) {
  const wrap = el("div", {
    style: {
      width: opts?.maxWidth ?? "100%",
      maxWidth: "100%",
      overflow: "hidden",
      boxSizing: "border-box",
      marginTop: "0",
      marginLeft: opts?.align === "right" || opts?.align === "center" ? "auto" : "0",
      marginRight: opts?.align === "center" ? "auto" : "0",
      background: "#ffffff",
    },
  });
  attachBarcodeImage(wrap, src, {
    width: "100%",
    maxWidth: "100%",
    ...(opts?.height ? { height: opts.height, maxHeight: opts.height } : {}),
  });
  parent.appendChild(wrap);
}

/** High-contrast QR (sync) for label corner — dark modules, white quiet zone. */
function qrPngDataUrl(value: string, pixelSize = 280): string | null {
  const v = value.trim();
  if (!v || v === "—") return null;
  try {
    const qr = QRCode.create(v, { errorCorrectionLevel: "M" });
    const modules = qr.modules;
    const count = modules.size;
    const quiet = 3;
    const cell = Math.max(4, Math.floor(pixelSize / (count + quiet * 2)));
    const dim = cell * (count + quiet * 2);
    const canvas = document.createElement("canvas");
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (modules.get(r, c)) {
          ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
        }
      }
    }
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[label:qr] failed", err instanceof Error ? err.message : err);
    return null;
  }
}

function formatLabelDate(raw: unknown): string {
  if (raw == null || raw === "") return "—";
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return String(raw);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function boxedCell(opts?: Partial<CSSStyleDeclaration>): HTMLDivElement {
  return el("div", {
    style: {
      boxSizing: "border-box",
      border: "1px solid #000000",
      padding: "2.5mm",
      background: "#ffffff",
      color: "#000000",
      minWidth: "0",
      ...opts,
    },
  });
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
 * Builds a print/PDF-ready boxed shipping label (professional grid + inset outer border).
 * Outer padding keeps the black frame from clipping on thermal print / PDF download.
 */
export function createOrderLabelElement(
  order: Order,
  settings: LabelInvoiceSettings,
  opts?: { documentTitle?: string }
): HTMLElement {
  const lines = orderLines(order);
  const page = labelPageSizeCss(settings.labelSize);
  const px = labelPixelBox(settings.labelSize);
  const visibleOrderNumber = displayOrderNumber(order);
  const awbVal = dash(order.awb || order.trackingId || order.velocityShipmentId);
  const st = shipBlock(order);
  const pay = paymentLabel(order);
  const collectable = orderCollectableTotal(order);
  const courierName = String(order.courierName || order.courier || "—").toUpperCase();

  // Fixed page size. Sections stack flush (no flex gap — gap caused bottom NOTE clipping).
  // Outer padding keeps the black frame from clipping on thermal print / PDF download.
  const host = el("div", {
    className: "shipamaze-order-label",
    style: {
      boxSizing: "border-box",
      width: `${px.w}px`,
      height: `${px.h}px`,
      minHeight: `${px.h}px`,
      maxHeight: `${px.h}px`,
      padding: "3mm",
      background: "#ffffff",
      color: "#000000",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "10px",
      lineHeight: "1.3",
      colorScheme: "light",
      overflow: "hidden",
      pageBreakInside: "avoid",
      breakInside: "avoid",
    },
  });

  const frame = el("div", {
    className: "shipamaze-label-frame",
    style: {
      boxSizing: "border-box",
      width: "100%",
      height: "100%",
      maxHeight: "100%",
      border: "2.5px solid #000000",
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      overflow: "hidden",
      background: "#ffffff",
    },
  });

  // ── Top: order meta (left) | logo (right) ─────────────────────────
  const showLogo =
    settings.showLogo &&
    Boolean(settings.logoUrl?.trim()) &&
    (settings.logoUrl!.trim().startsWith("http") || settings.logoUrl!.trim().startsWith("data:"));

  const topRow = el("div", {
    style: {
      display: "grid",
      gridTemplateColumns: showLogo ? "1fr 36mm" : "1fr",
      boxSizing: "border-box",
      borderBottom: "1px solid #000",
      flex: "0 0 auto",
    },
  });

  const metaBox = boxedCell({
    border: "none",
    borderRight: showLogo ? "1px solid #000" : "none",
    padding: "2mm 2.5mm",
  });
  const brand =
    settings.showBrandName && (settings.brandName || settings.companyName)
      ? dash(settings.brandName || settings.companyName)
      : null;
  if (brand && brand !== "—") {
    metaBox.appendChild(el("div", { style: { fontWeight: "800", fontSize: "11px", marginBottom: "1mm" }, text: brand }));
  }
  metaBox.appendChild(
    el("div", { style: { fontWeight: "700", fontSize: "10px" }, text: `Order Date: ${formatLabelDate(order.date)}` })
  );
  metaBox.appendChild(
    el("div", { style: { fontWeight: "700", fontSize: "10px", marginTop: "1mm" }, text: `Invoice / Order: ${dash(visibleOrderNumber)}` })
  );
  const payLine = pay === "COD" ? "COD" : "Prepaid";
  metaBox.appendChild(
    el("div", {
      style: {
        fontWeight: "900",
        fontSize: "15px",
        marginTop: "1.5mm",
        letterSpacing: "0.3px",
        color: "#000",
      },
      text: payLine,
    })
  );
  topRow.appendChild(metaBox);

  if (showLogo) {
    const logoBox = boxedCell({
      border: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2mm",
    });
    const img = document.createElement("img");
    img.src = settings.logoUrl!.trim();
    img.alt = "Logo";
    img.style.maxHeight = "52px";
    img.style.maxWidth = "30mm";
    img.style.width = "auto";
    img.style.height = "auto";
    img.style.objectFit = "contain";
    img.style.display = "block";
    logoBox.appendChild(img);
    topRow.appendChild(logoBox);
  }

  frame.appendChild(topRow);

  // ── Dims / Weight bar ─────────────────────────────────────────────
  const dimBar = boxedCell({
    border: "none",
    borderBottom: "1px solid #000",
    display: "flex",
    justifyContent: "space-between",
    gap: "4px",
    padding: "1.6mm 2.5mm",
    fontWeight: "700",
    fontSize: "10px",
    flex: "0 0 auto",
  });
  dimBar.appendChild(el("span", { text: `Dim : ${dimsText(order)}` }));
  dimBar.appendChild(el("span", { text: settings.showWeight ? weightLine(order).replace(/^Weight:\s*/i, "Weight : ") : "" }));
  frame.appendChild(dimBar);

  // ── Deliver To ────────────────────────────────────────────────────
  const deliver = boxedCell({
    border: "none",
    borderBottom: "1px solid #000",
    padding: "2mm 2.5mm",
    flex: "0 0 auto",
  });
  deliver.appendChild(el("div", { style: { fontWeight: "800", fontSize: "10px", marginBottom: "1mm" }, text: "Deliver To:" }));
  deliver.appendChild(el("div", { style: { fontWeight: "800", fontSize: "12px" }, text: st.name }));
  st.lines.forEach((ln) => deliver.appendChild(el("div", { style: { fontWeight: "600", fontSize: "10px", marginTop: "0.5mm" }, text: ln })));
  if (st.phone !== "—" && !settings.hideCustomerMobile) {
    deliver.appendChild(el("div", { style: { fontWeight: "700", fontSize: "10px", marginTop: "1mm" }, text: `Phone: ${st.phone}` }));
  }
  if (!settings.hidePickupAddress && !settings.hideWarehouseAddress && settings.warehouseAddress.trim()) {
    deliver.appendChild(
      el("div", {
        style: { fontSize: "8px", marginTop: "1mm", color: "#222" },
        text: `Warehouse: ${settings.warehouseAddress.trim()}`,
      })
    );
  }
  frame.appendChild(deliver);

  // ── AWB + routing strip ───────────────────────────────────────────
  const awbStrip = boxedCell({
    border: "none",
    borderBottom: "1px solid #000",
    padding: "1.6mm 2.5mm",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "4px",
    flex: "0 0 auto",
  });
  awbStrip.appendChild(
    el("div", { style: { fontWeight: "900", fontSize: "11px", letterSpacing: "0.3px" }, text: `AWB: ${awbVal}` })
  );
  awbStrip.appendChild(
    el("div", { style: { fontWeight: "700", fontSize: "10px" }, text: `Routing: ${dash(order.zone)}` })
  );
  frame.appendChild(awbStrip);

  // ── Product table (content height only — no empty stretch) ────────
  if (settings.showProductTable) {
    const tableWrap = boxedCell({
      border: "none",
      borderBottom: "1px solid #000",
      padding: "0",
      flex: "0 0 auto",
    });
    const tbl = document.createElement("table");
    tbl.style.width = "100%";
    tbl.style.borderCollapse = "collapse";
    tbl.style.fontSize = "9px";
    tbl.style.tableLayout = "fixed";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const headers: Array<{ label: string; w?: string }> = [];
    if (settings.showProductName) headers.push({ label: "Product", w: "34%" });
    headers.push({ label: "SKU", w: "18%" }, { label: "Qty", w: "10%" }, { label: "Amount", w: "18%" }, { label: "Total Price", w: "20%" });
    for (const h of headers) {
      const th = document.createElement("th");
      th.textContent = h.label;
      th.style.border = "1px solid #000";
      th.style.padding = "1.2mm 1.2mm";
      th.style.textAlign = "left";
      th.style.fontWeight = "800";
      th.style.background = "#f3f3f3";
      if (h.w) th.style.width = h.w;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    tbl.appendChild(thead);
    const tb = document.createElement("tbody");
    const allRows = lines.length > 0 ? lines : [{ name: "—", sku: "—", qty: 0, price: 0 }];
    const rows = allRows.slice(0, 3);
    for (const line of rows) {
      const tr = document.createElement("tr");
      const cells: string[] = [];
      if (settings.showProductName) cells.push(lineName(line));
      cells.push(lineSku(line), lineQty(line), lineUnitPrice(line), lineInvoiceRowTotal(line));
      for (const c of cells) {
        const td = document.createElement("td");
        td.textContent = c;
        td.style.border = "1px solid #000";
        td.style.padding = "1.2mm";
        td.style.verticalAlign = "top";
        td.style.fontWeight = "600";
        td.style.wordBreak = "break-word";
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    if (allRows.length > 3) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = headers.length;
      td.textContent = `+ ${allRows.length - 3} more item(s)`;
      td.style.border = "1px solid #000";
      td.style.padding = "1mm 1.2mm";
      td.style.fontWeight = "700";
      td.style.fontSize = "8px";
      tr.appendChild(td);
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    tableWrap.appendChild(tbl);
    frame.appendChild(tableWrap);
  }

  // ── Important (below product box) ─────────────────────────────────
  const importantBox = boxedCell({
    border: "none",
    borderBottom: "1px solid #000",
    padding: "1.6mm 2.5mm",
    fontSize: "7.5px",
    fontWeight: "600",
    lineHeight: "1.3",
    flex: "0 0 auto",
  });
  const importantTitle = el("span", { style: { fontWeight: "900" }, text: "Important: " });
  const importantBody = document.createElement("span");
  importantBody.appendChild(document.createTextNode("Please record an "));
  importantBody.appendChild(el("span", { style: { fontWeight: "900" }, text: "unboxing video" }));
  importantBody.appendChild(
    document.createTextNode(" while opening the parcel. This video is ")
  );
  importantBody.appendChild(el("span", { style: { fontWeight: "900" }, text: "mandatory" }));
  importantBody.appendChild(
    document.createTextNode(" for raising any disputes or return requests. Thank you!")
  );
  importantBox.appendChild(importantTitle);
  importantBox.appendChild(importantBody);
  frame.appendChild(importantBox);

  // ── COD collectible + Order ID QR (side by side) ──────────────────
  const codCollectibleAmount = pay === "COD" ? collectable : 0;
  const totals = boxedCell({
    border: "none",
    borderBottom: "1px solid #000",
    padding: "0",
    display: "grid",
    gridTemplateColumns: "1fr 24mm",
    alignItems: "center",
    flex: "0 0 auto",
  });
  const collectCell = boxedCell({
    border: "none",
    borderRight: "1px solid #000",
    padding: "2mm 2.5mm",
    fontWeight: "700",
    fontSize: "10px",
  });
  collectCell.appendChild(el("div", { text: "COD collectible amount" }));
  collectCell.appendChild(
    el("div", {
      style: { fontWeight: "900", fontSize: "14px", marginTop: "1mm" },
      text: `Rs. ${formatMoneyAmount(codCollectibleAmount)}`,
    })
  );
  totals.appendChild(collectCell);

  const qrBox = boxedCell({
    border: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "1.2mm",
  });
  const orderQrPayload =
    visibleOrderNumber !== "—"
      ? String(visibleOrderNumber)
      : String(order.id || "ShipAmaze");
  const qrSrc = qrPngDataUrl(orderQrPayload, 320);
  if (qrSrc) {
    const qimg = document.createElement("img");
    qimg.src = qrSrc;
    qimg.alt = "Order ID QR";
    qimg.style.width = "18mm";
    qimg.style.height = "18mm";
    qimg.style.objectFit = "contain";
    qimg.style.imageRendering = "pixelated";
    qimg.style.display = "block";
    qrBox.appendChild(qimg);
  }
  qrBox.appendChild(
    el("div", {
      style: { fontWeight: "800", fontSize: "6.5px", marginTop: "0.6mm", wordBreak: "break-all", lineHeight: "1.15" },
      text: `Order Id: ${dash(visibleOrderNumber)}`,
    })
  );
  totals.appendChild(qrBox);
  frame.appendChild(totals);

  // ── Courier + AWB barcode (absorbs leftover space; shrinks before NOTE) ─
  const footer = boxedCell({
    border: "none",
    borderBottom: "1px solid #000",
    padding: "1.2mm 2.5mm",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "center",
    gap: "0.6mm",
    flex: "1 1 auto",
    minHeight: "0",
    overflow: "hidden",
  });
  footer.appendChild(
    el("div", {
      style: {
        fontWeight: "800",
        fontSize: "10px",
        textAlign: "center",
        letterSpacing: "0.2px",
        flex: "0 0 auto",
      },
      text: `${courierName}${awbVal !== "—" ? ` — ${awbVal}` : ""}`,
    })
  );

  if (settings.showBarcode && awbVal !== "—") {
    const barcodePad = el("div", {
      style: {
        width: "94%",
        maxWidth: "94%",
        margin: "0 auto",
        overflow: "hidden",
        boxSizing: "border-box",
        background: "#ffffff",
        flex: "1 1 auto",
        minHeight: "8mm",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      },
    });
    const src = barcodePngDataUrl(awbVal, {
      height: 72,
      moduleWidth: 3,
      margin: 10,
      displayValue: false,
    });
    if (src) {
      attachFittedBarcode(barcodePad, src, { maxWidth: "100%", height: "10mm", align: "center" });
    }
    footer.appendChild(barcodePad);
    footer.appendChild(
      el("div", {
        style: {
          textAlign: "center",
          fontWeight: "800",
          fontSize: "10px",
          fontFamily: "monospace",
          letterSpacing: "0.8px",
          flex: "0 0 auto",
        },
        text: awbVal,
      })
    );
  }
  frame.appendChild(footer);

  // ── NOTE (pinned last — must stay fully visible on 4×6 download/print) ─
  const noteBox = boxedCell({
    border: "none",
    padding: "1.4mm 2.5mm",
    fontSize: "7px",
    fontWeight: "600",
    lineHeight: "1.25",
    flex: "0 0 auto",
    flexShrink: "0",
  });
  noteBox.appendChild(el("span", { style: { fontWeight: "900" }, text: "NOTE: " }));
  noteBox.appendChild(
    document.createTextNode(
      "If outer packaging/label is found tempered/damaged, do not accept parcel. All disputes are subject to Gujarat jurisdiction only."
    )
  );
  if (settings.invoiceNote.trim()) {
    noteBox.appendChild(document.createElement("br"));
    noteBox.appendChild(document.createTextNode(settings.invoiceNote.trim()));
  }
  frame.appendChild(noteBox);

  host.appendChild(frame);
  host.dataset.pageSize = page.page;
  host.dataset.pageWidth = page.width;
  host.dataset.pageMinHeight = page.minHeight;
  return host;
}

export function createAmazonTransportationLabelElement(order: Order): HTMLElement {
  const page = labelPageSizeCss("4x6");
  const st = shipBlock(order);
  const awb = dash(order.awb || order.trackingId || order.velocityShipmentId);
  const shipDate = order.date ? new Date(order.date) : new Date();
  const shipDateText = Number.isNaN(shipDate.getTime())
    ? dash(order.date)
    : `${String(shipDate.getDate()).padStart(2, "0")}/${String(shipDate.getMonth() + 1).padStart(2, "0")}`;
  const payment = paymentLabel(order).toUpperCase();

  const host = el("div", {
    className: "shipamaze-order-label shipamaze-amazon-label",
    style: {
      boxSizing: "border-box",
      width: page.width,
      minHeight: page.minHeight,
      padding: "3mm",
      background: "#ffffff",
      color: "#000000",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "11px",
      lineHeight: "1.15",
      colorScheme: "light",
      overflow: "hidden",
    },
  });

  const frame = el("div", {
    className: "shipamaze-label-frame",
    style: {
      boxSizing: "border-box",
      width: "100%",
      minHeight: "100%",
      border: "2.5px solid #000000",
      padding: "3mm",
      overflow: "hidden",
      background: "#ffffff",
    },
  });

  const top = el("div", { style: { display: "grid", gridTemplateColumns: "1fr 28mm", gap: "3mm", alignItems: "start" } });
  const left = el("div", { style: { minWidth: "0", overflow: "hidden" } });
  const awbBarcode = barcodePngDataUrl(awb, { height: 128, moduleWidth: 5, margin: 12 });
  if (awbBarcode) {
    attachFittedBarcode(left, awbBarcode, { maxWidth: "100%", height: "28mm", align: "center" });
  }
  left.appendChild(el("div", { style: { textAlign: "center", fontWeight: "900", fontSize: "12px", marginTop: "-2mm", color: "#000000" }, text: `AWB ${awb}` }));
  top.appendChild(left);

  const right = el("div", { style: { display: "grid", gap: "1.5mm" } });
  const rightBox = (text: string, invert = false) =>
    el("div", {
      style: {
        border: "2px solid #000",
        padding: "1.5mm",
        textAlign: "center",
        fontWeight: "800",
        fontSize: "16px",
        lineHeight: "1",
        background: invert ? "#000" : "#fff",
        color: invert ? "#fff" : "#000",
      },
      text,
    });
  right.appendChild(rightBox(String(order.zone || "SUR").slice(0, 8).toUpperCase()));
  right.appendChild(rightBox(`${dash(order.weight || "0.5")} kg`.replace(/kg kg/i, "kg"), false));
  right.appendChild(rightBox(payment, false));
  top.appendChild(right);
  frame.appendChild(top);

  const shipTo = el("div", { style: { marginTop: "3mm", fontWeight: "700" }, text: "Ship To:" });
  frame.appendChild(shipTo);
  frame.appendChild(el("div", { style: { fontWeight: "700", fontSize: "12px" }, text: st.name }));
  st.lines.forEach((ln) => frame.appendChild(el("div", { style: { fontWeight: "700" }, text: ln })));
  if (st.phone !== "—") frame.appendChild(el("div", { style: { fontWeight: "700" }, text: `Phone: ${st.phone}` }));

  const orderMeta = el("div", {
    style: { marginTop: "3mm", borderBottom: "1px solid #000", paddingBottom: "2mm", fontWeight: "700" },
  });
  const visibleOrderNumber = displayOrderNumber(order);
  orderMeta.appendChild(el("div", { text: `Order Id: ${dash(visibleOrderNumber)}` }));
  orderMeta.appendChild(el("div", { text: `Ship Date: ${shipDateText}` }));
  frame.appendChild(orderMeta);

  // Barcode priority for scanners: AWB → Tracking → Order ID (only these; no phone/amount barcodes).
  const trackingVal = String(order.trackingId ?? "").trim();
  const barcodeValues: Array<{ label: string; value: string }> = [];
  if (awb && awb !== "—") barcodeValues.push({ label: "AWB", value: awb });
  if (trackingVal && trackingVal !== awb) barcodeValues.push({ label: "Tracking", value: trackingVal });
  if (visibleOrderNumber && visibleOrderNumber !== "—" && visibleOrderNumber !== awb && visibleOrderNumber !== trackingVal) {
    barcodeValues.push({ label: "Order", value: visibleOrderNumber });
  }
  const qrRow = el("div", {
    style: {
      display: "grid",
      gridTemplateColumns: barcodeValues.length <= 1 ? "1fr" : `2fr ${"1fr ".repeat(Math.max(0, barcodeValues.length - 1)).trim()}`,
      gap: "4mm",
      padding: "4mm 0",
      borderBottom: "1px solid #000",
    },
  });
  barcodeValues.forEach((item, idx) => {
    const isPrimary = idx === 0;
    const src = barcodePngDataUrl(item.value, {
      height: isPrimary ? 96 : 64,
      moduleWidth: isPrimary ? 4 : 3,
      displayValue: false,
      margin: 8,
    });
    const box = el("div", {
      style: {
        border: isPrimary ? "3px solid #000" : "2px solid #000",
        height: isPrimary ? "24mm" : "18mm",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxSizing: "border-box",
        gap: "1mm",
      },
    });
    if (src) {
      attachBarcodeImage(box, src, {
        width: "100%",
        maxWidth: "100%",
        maxHeight: isPrimary ? "20mm" : "14mm",
        transform: barcodeValues.length > 1 ? "rotate(90deg) scale(1.05)" : undefined,
        imageRendering: "pixelated",
      });
    }
    box.appendChild(
      el("div", {
        style: { fontSize: "8px", fontWeight: "800", textAlign: "center" },
        text: item.label,
      })
    );
    qrRow.appendChild(box);
  });
  frame.appendChild(qrRow);

  const pickup = typeof order.pickupAddress === "object" && order.pickupAddress
    ? order.pickupAddress
    : null;
  const shipFromLines = [
    "Ship From:",
    pickup?.label || "Seller",
    pickup?.address || "",
    [pickup?.city, pickup?.state, pickup?.pincode].filter(Boolean).join(", "),
  ].filter(Boolean);
  const fromBlock = el("div", { style: { padding: "2mm 0", fontSize: "9px", fontWeight: "700", borderBottom: "1px solid #000" } });
  shipFromLines.forEach((line) => fromBlock.appendChild(el("div", { text: line })));
  frame.appendChild(fromBlock);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.marginTop = "2mm";
  table.style.fontSize = "9px";
  ["SELLER", "GSTIN", "INVOICE", "DATE", "ITEM TYPE"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    th.style.border = "1px solid #000";
    th.style.padding = "1mm";
    table.appendChild(th);
  });
  const tr = document.createElement("tr");
  ["", "", dash(visibleOrderNumber), shipDateText, lineName(orderLines(order)[0] ?? {})].forEach((v) => {
    const td = document.createElement("td");
    td.textContent = v;
    td.style.border = "1px solid #000";
    td.style.padding = "1mm";
    tr.appendChild(td);
  });
  table.appendChild(tr);
  frame.appendChild(table);

  host.appendChild(frame);
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
  const px = labelPixelBox(settings.labelSize);
  const styles = `
    @page { size: ${page.page}; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .shipamaze-order-label {
      margin: 0;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      background: #fff !important;
      padding: 3mm !important;
      width: ${page.width} !important;
      max-width: ${page.width} !important;
      height: ${page.minHeight} !important;
      max-height: ${page.minHeight} !important;
      min-height: ${page.minHeight} !important;
    }
    .shipamaze-order-label:last-child { page-break-after: auto; }
    .shipamaze-label-frame {
      border: 2.5px solid #000 !important;
      box-sizing: border-box !important;
      width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
      overflow: hidden !important;
      background: #fff !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 0 !important;
    }
    .shipamaze-order-label img {
      max-width: 100% !important;
      height: auto !important;
      box-sizing: border-box !important;
      background: #fff !important;
    }
    @media print {
      /* Do NOT clamp html/body to a single page height — that collapses bulk print to 1 page. */
      html, body { background: #fff !important; color: #000 !important; width: ${page.width}; height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; }
      .shipamaze-label-frame { border: 2.5px solid #000 !important; }
    }
    @media screen {
      html, body { background: #f0f0f0; }
      body { display: flex; flex-direction: column; align-items: center; padding: 20px; min-height: 100vh; }
      .shipamaze-order-label { box-shadow: 0 2px 8px rgba(0,0,0,0.18); margin: 8px 0; background: #fff; }
    }
  `;
  const winW = px.w + 60;
  const winH = Math.min(px.h + 120, 900);
  const w = window.open("", "_blank", `width=${winW},height=${winH}`);
  if (!w) {
    throw new Error("Popup blocked — please allow popups for this site");
  }
  w.document.open();
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body><p style="font-family:system-ui,sans-serif;padding:24px;color:#333">Preparing ${nodes.length} invoice(s)…</p></body></html>`
  );
  w.document.close();

  // Build off the critical path: append in one fragment, then print after images settle.
  const frag = w.document.createDocumentFragment();
  for (const node of nodes) {
    frag.appendChild(w.document.importNode(node, true));
  }
  w.document.body.replaceChildren(frag);

  const imgs = Array.from(w.document.images);
  const waitMs = Math.min(2_500, 200 + nodes.length * 8);
  const ready = imgs.length
    ? Promise.all(
        imgs.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.addEventListener("load", () => resolve(), { once: true });
                  img.addEventListener("error", () => resolve(), { once: true });
                })
        )
      )
    : Promise.resolve();

  void ready.then(() => {
    w.setTimeout(() => {
      w.focus();
      w.print();
    }, waitMs);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renders label nodes to a multi-page PDF blob (optimized for bulk — parallel canvas capture).
 */
export async function renderLabelNodesToPdfBlob(
  nodes: HTMLElement[],
  settings: LabelInvoiceSettings
): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const mm = labelPdfDimensionsMm(settings.labelSize);
  const px = labelPixelBox(settings.labelSize);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [mm.w, mm.h] });
  const scale = 2;
  const captureLimit = 4;

  async function captureNode(node: HTMLElement, index: number): Promise<string> {
    node.style.position = "fixed";
    node.style.left = "-99999px";
    node.style.top = "0";
    node.style.zIndex = String(-1000 - index);
    node.style.pointerEvents = "none";
    node.style.width = `${px.w}px`;
    node.style.height = `${px.h}px`;
    node.style.minHeight = `${px.h}px`;
    node.style.maxHeight = `${px.h}px`;
    node.style.overflow = "hidden";
    document.body.appendChild(node);
    try {
      const canvas = await html2canvas(node, {
        scale,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: px.w,
        height: px.h,
      });
      // PNG preserves barcode bar edges; JPEG compression often makes them unscannable.
      return canvas.toDataURL("image/png");
    } finally {
      document.body.removeChild(node);
    }
  }

  const images: string[] = new Array(nodes.length);
  let next = 0;
  async function captureWorker() {
    for (;;) {
      const idx = next;
      next += 1;
      if (idx >= nodes.length) return;
      images[idx] = await captureNode(nodes[idx]!, idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(captureLimit, nodes.length) }, () => captureWorker()));

  for (let i = 0; i < images.length; i++) {
    if (i > 0) pdf.addPage([mm.w, mm.h]);
    pdf.addImage(images[i]!, "PNG", 0, 0, mm.w, mm.h, undefined, "FAST");
  }

  return pdf.output("blob");
}

function openPdfBlob(blob: Blob): void {
  const blobUrl = URL.createObjectURL(blob);
  const tab = window.open(blobUrl, "_blank");
  if (!tab) {
    URL.revokeObjectURL(blobUrl);
    throw new Error("Popup blocked — please allow popups for this site");
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
}

/**
 * Renders label nodes to a multi-page PDF and opens it in a new browser tab.
 */
export async function openLabelNodesAsPdf(
  nodes: HTMLElement[],
  settings: LabelInvoiceSettings,
  title: string
): Promise<void> {
  const tab = window.open("", "_blank");
  if (!tab) throw new Error("Popup blocked — please allow popups for this site");
  tab.document.open();
  tab.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;padding:24px;">Preparing ${nodes.length} label(s)…</body></html>`
  );
  tab.document.close();

  const blob = await renderLabelNodesToPdfBlob(nodes, settings);
  const blobUrl = URL.createObjectURL(blob);
  tab.location.href = blobUrl;
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
}

export async function downloadOrderLabelPdf(
  order: Order,
  settings: LabelInvoiceSettings,
  filename: string,
  documentTitle = "Label"
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const labelEl = createOrderLabelElement(order, settings, { documentTitle });
  const px = labelPixelBox(settings.labelSize);
  labelEl.style.position = "fixed";
  labelEl.style.left = "-99999px";
  labelEl.style.top = "0";
  labelEl.style.zIndex = "0";
  labelEl.style.pointerEvents = "none";
  labelEl.style.width = `${px.w}px`;
  labelEl.style.height = `${px.h}px`;
  labelEl.style.minHeight = `${px.h}px`;
  labelEl.style.maxHeight = `${px.h}px`;
  labelEl.style.overflow = "hidden";
  document.body.appendChild(labelEl);
  try {
    const canvas = await html2canvas(labelEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: px.w,
      height: px.h,
    });
    const mm = labelPdfDimensionsMm(settings.labelSize);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [mm.w, mm.h] });
    const img = canvas.toDataURL("image/png");
    pdf.addImage(img, "PNG", 0, 0, mm.w, mm.h, undefined, "FAST");
    pdf.save(filename);
  } finally {
    document.body.removeChild(labelEl);
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
