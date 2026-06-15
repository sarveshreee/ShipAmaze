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

function optBool(v: unknown, def: boolean) {
  return v === true || v === false ? v : def;
}

function toDto(doc?: Record<string, unknown> | null) {
  const d = doc ?? {};
  return {
    companyName: strField(d.companyName),
    address: strField(d.address),
    logoUrl: strField(d.logoUrl),
    gstAddress: strField(d.gstAddress),
    returnAddress: strField(d.returnAddress),
    returnMobile: strField(d.returnMobile),
    warehouseAddress: strField(d.warehouseAddress),
    warehouseMobile: strField(d.warehouseMobile),
    brandName: strField(d.brandName),
    invoiceNote: strField(d.invoiceNote),
    footerNote: strField(d.footerNote),
    showBarcode: d.showBarcode !== false,
    showCodValue: d.showCodValue !== false,
    showProductTable: d.showProductTable !== false,
    hideCustomerMobile: d.hideCustomerMobile === true,
    hideWarehouseAddress: d.hideWarehouseAddress === true,
    hideWarehouseMobile: d.hideWarehouseMobile === true,
    hideReturnAddress: d.hideReturnAddress === true,
    hideReturnMobile: d.hideReturnMobile === true,
    hidePickupAddress: d.hidePickupAddress === true,
    showLogo: d.showLogo !== false,
    showBrandName: d.showBrandName !== false,
    showWeight: d.showWeight !== false,
    showProductName: d.showProductName !== false,
    showGstAddress: d.showGstAddress === true,
    labelSize: (LABEL_SIZES.has(d.labelSize as LabelSizePreset) ? d.labelSize : "4x6") as LabelSizePreset,
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : undefined,
  };
}

/** Safe subset for unauthenticated label rendering (no internal metadata). */
function toPublicDto(doc?: Record<string, unknown> | null) {
  const base = toDto(doc ?? {});
  return {
    companyName: base.companyName,
    address: base.address,
    logoUrl: base.logoUrl,
    gstAddress: base.gstAddress,
    returnAddress: base.returnAddress,
    returnMobile: base.returnMobile,
    warehouseAddress: base.warehouseAddress,
    warehouseMobile: base.warehouseMobile,
    brandName: base.brandName,
    invoiceNote: base.invoiceNote,
    footerNote: base.footerNote,
    showBarcode: base.showBarcode,
    showCodValue: base.showCodValue,
    showProductTable: base.showProductTable,
    hideCustomerMobile: base.hideCustomerMobile,
    hideWarehouseAddress: base.hideWarehouseAddress,
    hideWarehouseMobile: base.hideWarehouseMobile,
    hideReturnAddress: base.hideReturnAddress,
    hideReturnMobile: base.hideReturnMobile,
    hidePickupAddress: base.hidePickupAddress,
    showLogo: base.showLogo,
    showBrandName: base.showBrandName,
    showWeight: base.showWeight,
    showProductName: base.showProductName,
    showGstAddress: base.showGstAddress,
    labelSize: base.labelSize,
  };
}

function buildPayloadFromBody(b: Record<string, unknown>, labelSize: LabelSizePreset) {
  return {
    companyName: String(b.companyName ?? "").trim(),
    address: String(b.address ?? "").trim(),
    logoUrl: String(b.logoUrl ?? "").trim(),
    gstAddress: String(b.gstAddress ?? "").trim(),
    returnAddress: String(b.returnAddress ?? "").trim(),
    returnMobile: String(b.returnMobile ?? "").trim(),
    warehouseAddress: String(b.warehouseAddress ?? "").trim(),
    warehouseMobile: String(b.warehouseMobile ?? "").trim(),
    brandName: String(b.brandName ?? "").trim(),
    invoiceNote: String(b.invoiceNote ?? "").trim(),
    footerNote: String(b.footerNote ?? "").trim(),
    showBarcode: optBool(b.showBarcode, true),
    showCodValue: optBool(b.showCodValue, true),
    showProductTable: optBool(b.showProductTable, true),
    hideCustomerMobile: optBool(b.hideCustomerMobile, false),
    hideWarehouseAddress: optBool(b.hideWarehouseAddress, false),
    hideWarehouseMobile: optBool(b.hideWarehouseMobile, false),
    hideReturnAddress: optBool(b.hideReturnAddress, false),
    hideReturnMobile: optBool(b.hideReturnMobile, false),
    hidePickupAddress: optBool(b.hidePickupAddress, false),
    showLogo: optBool(b.showLogo, true),
    showBrandName: optBool(b.showBrandName, true),
    showWeight: optBool(b.showWeight, true),
    showProductName: optBool(b.showProductName, true),
    showGstAddress: optBool(b.showGstAddress, false),
    labelSize,
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
  const payload = buildPayloadFromBody(b, labelSize);

  const doc = await LabelInvoiceSetting.findOneAndUpdate(
    { key: GLOBAL_KEY },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  if (!doc) throw new AppError(500, "Failed to save settings");
  res.json(toDto(doc));
});
