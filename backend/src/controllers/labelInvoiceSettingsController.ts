import type { Request, Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { LabelInvoiceSetting, type LabelSizePreset } from "../models/LabelInvoiceSetting.js";

const GLOBAL_KEY = "global";

const LABEL_SIZES = new Set<LabelSizePreset>(["4x6", "A6", "A5"]);

function strField(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function toDto(doc?: {
  companyName?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  invoiceNote?: string | null;
  footerNote?: string | null;
  showBarcode?: boolean | null;
  showCodValue?: boolean | null;
  showProductTable?: boolean | null;
  labelSize?: string | null;
  updatedAt?: Date;
} | null) {
  const d = doc ?? {};
  return {
    companyName: strField(d.companyName),
    address: strField(d.address),
    logoUrl: strField(d.logoUrl),
    invoiceNote: strField(d.invoiceNote),
    footerNote: strField(d.footerNote),
    showBarcode: d.showBarcode !== false,
    showCodValue: d.showCodValue !== false,
    showProductTable: d.showProductTable !== false,
    labelSize: (LABEL_SIZES.has(d.labelSize as LabelSizePreset) ? d.labelSize : "4x6") as LabelSizePreset,
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : undefined,
  };
}

/** Safe subset for unauthenticated label rendering (no internal metadata). */
function toPublicDto(doc?: {
  companyName?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  invoiceNote?: string | null;
  footerNote?: string | null;
  showBarcode?: boolean | null;
  showCodValue?: boolean | null;
  showProductTable?: boolean | null;
  labelSize?: string | null;
} | null) {
  const base = toDto(doc ?? {});
  return {
    companyName: base.companyName,
    address: base.address,
    logoUrl: base.logoUrl,
    invoiceNote: base.invoiceNote,
    footerNote: base.footerNote,
    showBarcode: base.showBarcode,
    showCodValue: base.showCodValue,
    showProductTable: base.showProductTable,
    labelSize: base.labelSize,
  };
}

export const getLabelInvoiceSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const doc = await LabelInvoiceSetting.findOne({ key: GLOBAL_KEY }).lean();
  res.json(toDto(doc ?? {}));
});

export const getPublicLabelInvoiceSettings = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await LabelInvoiceSetting.findOne({ key: GLOBAL_KEY }).lean();
  res.json(toPublicDto(doc ?? {}));
});

export const putLabelInvoiceSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const b = req.body as Record<string, unknown>;
  const labelSizeRaw = String(b.labelSize ?? "").trim();
  const labelSize = LABEL_SIZES.has(labelSizeRaw as LabelSizePreset) ? (labelSizeRaw as LabelSizePreset) : "4x6";

  const optBool = (v: unknown, def: boolean) => (v === true || v === false ? v : def);

  const payload = {
    companyName: String(b.companyName ?? "").trim(),
    address: String(b.address ?? "").trim(),
    logoUrl: String(b.logoUrl ?? "").trim(),
    invoiceNote: String(b.invoiceNote ?? "").trim(),
    footerNote: String(b.footerNote ?? "").trim(),
    showBarcode: optBool(b.showBarcode, true),
    showCodValue: optBool(b.showCodValue, true),
    showProductTable: optBool(b.showProductTable, true),
    labelSize,
  };

  const doc = await LabelInvoiceSetting.findOneAndUpdate(
    { key: GLOBAL_KEY },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  if (!doc) throw new AppError(500, "Failed to save settings");
  res.json(toDto(doc));
});
