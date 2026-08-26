import * as XLSX from "xlsx";

export type ParsedGstRow = {
  orderId: string;
  date: string;
  customer: string;
  amount: number;
  gstPct: number;
  gstAmount: number;
  taxableValue: number;
  total: number;
  payment: "COD" | "Prepaid";
  status: string;
  meta?: Record<string, unknown>;
};

function normHeader(h: unknown): string {
  return String(h ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function pick(row: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const want = normHeader(alias);
    for (const [k, v] of entries) {
      if (normHeader(k) === want) return v;
      if (normHeader(k).includes(want) && want.length >= 4) return v;
    }
  }
  return undefined;
}

function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/[₹,\s]/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  // Excel serial date
  if (typeof v === "number" && v > 20000 && v < 80000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(v);
      if (parsed) {
        const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
        return d.toISOString();
      }
    } catch {
      /* fall through */
    }
  }
  return String(v).trim();
}

function mapPayment(raw: unknown): "COD" | "Prepaid" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("pre") || s.includes("online") || s.includes("prepaid")) return "Prepaid";
  return "COD";
}

function mapStatus(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "Processed";
  const lower = s.toLowerCase();
  if (lower === "delivered" || lower === "settled") return "Settled";
  if (lower.includes("pending")) return "Pending";
  if (lower.includes("process") || lower.includes("transit") || lower.includes("ship")) return "Processed";
  return s;
}

/**
 * Parse GST / order Excel (or CSV) buffer into normalized GST rows.
 * Supports logistics exports with columns like Order ID, Consignee, TP (INC GST), GST, Mode, Status.
 */
export function parseGstExcelBuffer(buffer: Buffer): ParsedGstRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const out: ParsedGstRow[] = [];
  for (const row of rawRows) {
    const orderId = toStr(
      pick(row, ["Order ID", "Channel Order ID", "order id", "order_id", "OrderId", "AWB", "Waybill Number"])
    );
    if (!orderId) continue;

    const customer = toStr(pick(row, ["Consignee", "Customer", "Customer Name", "Buyer"]));
    const date = toStr(
      pick(row, ["Order Date", "Channel Order Date", "Date", "Delivered", "Added On", "channel order date"])
    );
    const totalInc = toNum(pick(row, ["TP (INC GST)", "TP INC GST", "Amount", "Total", "COD Amount", "Invoice Amount"]));
    const taxable = toNum(pick(row, ["TP (EXC GST)", "TP EXC GST", "Taxable", "Taxable Value", "Taxable Amount"]));
    const gstAmount = toNum(pick(row, ["GST", "GST Amount", "Tax Amount", "IGST", "CGST"]));
    let gstPct = toNum(pick(row, ["GST %", "GST%", "GST Percent", "gst_percent", "Tax %"]));
    if (!gstPct && taxable > 0 && gstAmount > 0) {
      gstPct = Math.round((gstAmount / taxable) * 10000) / 100;
    }
    if (!gstPct && totalInc > 0 && gstAmount > 0) {
      const base = totalInc - gstAmount;
      if (base > 0) gstPct = Math.round((gstAmount / base) * 10000) / 100;
    }

    const payment = mapPayment(pick(row, ["Mode", "Payment", "Payment Mode", "Payment Type"]));
    const status = mapStatus(pick(row, ["Status", "Order Status", "Delivery Status"]));

    const amount = totalInc || taxable + gstAmount;
    const taxableValue = taxable || (gstPct > 0 ? amount / (1 + gstPct / 100) : amount - gstAmount);
    const resolvedGst =
      gstAmount || (gstPct > 0 ? amount - amount / (1 + gstPct / 100) : Math.max(0, amount - taxableValue));

    out.push({
      orderId,
      date,
      customer,
      amount: Math.round(amount * 100) / 100,
      gstPct: Math.round(gstPct * 100) / 100,
      gstAmount: Math.round(resolvedGst * 100) / 100,
      taxableValue: Math.round(taxableValue * 100) / 100,
      total: Math.round((totalInc || amount) * 100) / 100,
      payment,
      status,
      meta: {
        productName: toStr(pick(row, ["Product Name", "Product", "Item"])),
        sku: toStr(pick(row, ["SKU", "Sku"])),
        waybill: toStr(pick(row, ["Waybill Number", "AWB", "Tracking"])),
        city: toStr(pick(row, ["City"])),
        state: toStr(pick(row, ["State"])),
        pincode: toStr(pick(row, ["Pincode", "Pin Code", "ZIP"])),
        fulfilledBy: toStr(pick(row, ["Fulfilled By", "Courier", "Carrier"])),
        quantity: toNum(pick(row, ["Quantity", "Qty"])),
      },
    });
  }

  return out;
}
