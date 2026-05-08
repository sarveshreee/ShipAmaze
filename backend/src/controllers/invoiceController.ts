import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Invoice } from "../models/Invoice.js";
import { csvRow, exportFilename } from "../utils/reportQuery.js";

async function findInvoiceForUser(invoiceId: string, user: NonNullable<AuthRequest["user"]>) {
  const inv = await Invoice.findOne({ invoiceId }).lean();
  if (!inv) throw new AppError(404, "Invoice not found");
  if (user.role !== "admin" && String(inv.userId ?? "") !== String(user._id)) {
    throw new AppError(403, "Forbidden");
  }
  return inv;
}

export const getInvoice = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const inv = await findInvoiceForUser(req.params.invoiceId, req.user);
  res.json({
    id: inv.invoiceId,
    invoiceId: inv.invoiceId,
    date: inv.date,
    period: inv.period,
    orders: inv.ordersCount,
    ordersCount: inv.ordersCount,
    shippingCharges: inv.shippingCharges,
    codCharges: inv.codCharges,
    gst: inv.gst,
    total: inv.total,
    status: inv.status,
    downloadUrl: inv.downloadUrl ?? null,
    pdfAvailable: Boolean(inv.downloadUrl && /^https?:\/\//i.test(String(inv.downloadUrl))),
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  });
});

export const exportInvoiceCsv = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const inv = await findInvoiceForUser(req.params.invoiceId, req.user);
  const filename = exportFilename(`invoice-${inv.invoiceId}`);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.write(
    csvRow([
      "Field",
      "Value",
    ])
  );
  const lines: [string, string | number][] = [
    ["invoiceId", inv.invoiceId],
    ["date", inv.date],
    ["period", inv.period],
    ["ordersCount", inv.ordersCount],
    ["shippingCharges", inv.shippingCharges],
    ["codCharges", inv.codCharges],
    ["gst", inv.gst],
    ["total", inv.total],
    ["status", inv.status],
  ];
  for (const [k, v] of lines) {
    res.write(csvRow([k, v]));
  }
  res.end();
});

const ALLOWED_STATUS = new Set(["Paid", "Unpaid", "Overdue", "Cancelled"]);

export const patchInvoiceStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const status = String((req.body as { status?: string }).status ?? "").trim();
  if (!ALLOWED_STATUS.has(status)) throw new AppError(400, "Invalid status");
  const doc = await Invoice.findOne({ invoiceId: req.params.invoiceId });
  if (!doc) throw new AppError(404, "Invoice not found");
  doc.status = status;
  await doc.save();
  res.json({ ok: true, status: doc.status });
});

/** Stub: no PDF engine — records intent and returns availability flag. */
export const postInvoiceGenerateStub = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const inv = await Invoice.findOne({ invoiceId: req.params.invoiceId });
  if (!inv) throw new AppError(404, "Invoice not found");
  res.status(200).json({
    ok: true,
    pdfGenerated: false,
    message:
      "PDF generation is not configured on this deployment. Use CSV export from the invoice detail view, or attach a file URL via admin tools when available.",
    invoiceId: inv.invoiceId,
  });
});
