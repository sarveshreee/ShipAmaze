import type { Request, Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { LabelInvoiceSetting, type LabelSizePreset } from "../models/LabelInvoiceSetting.js";
import { Dropshipper } from "../models/Dropshipper.js";
import { Order } from "../models/Order.js";
import { auditLog } from "../utils/devLog.js";
import { buildOrderVisibilityQuery } from "../utils/orderFilters.js";

const GLOBAL_KEY = "global";

const LABEL_SIZES = new Set<LabelSizePreset>(["4x6", "A6", "A5"]);

/** Max data-URL / remote logo length (~1.5MB) to avoid oversized documents. */
const MAX_LOGO_URL_CHARS = 1_600_000;

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

function isAllowedLogoUrl(url: string): boolean {
  if (!url) return true;
  if (url.length > MAX_LOGO_URL_CHARS) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/");
}

async function getDropshipperLabelLogo(userId: mongoose.Types.ObjectId | string): Promise<string> {
  const doc = await Dropshipper.findOne({ userId }).select("labelLogoUrl").lean();
  return String(doc?.labelLogoUrl ?? "").trim();
}

export const getLabelInvoiceSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const doc = await LabelInvoiceSetting.findOne({ key: GLOBAL_KEY }).lean();
  const dto = toDto(doc ?? {});

  // Dropshippers see their own logo on labels when configured (fallback = global).
  if (req.user.role === "dropshipper") {
    const custom = await getDropshipperLabelLogo(req.user._id);
    if (custom && isAllowedLogoUrl(custom)) {
      dto.logoUrl = custom;
    }
  }

  res.json(dto);
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

/** Dropshipper: read own shipping-label logo. */
export const getMyLabelLogo = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "dropshipper") throw new AppError(403, "Only dropshippers can manage a personal label logo");

  const logoUrl = await getDropshipperLabelLogo(req.user._id);
  res.json({ logoUrl });
});

/** Dropshipper: upload / replace own shipping-label logo. */
export const putMyLabelLogo = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "dropshipper") throw new AppError(403, "Only dropshippers can manage a personal label logo");

  const logoUrl = String((req.body as { logoUrl?: unknown }).logoUrl ?? "").trim();
  if (!logoUrl) throw new AppError(400, "logoUrl is required");
  if (!isAllowedLogoUrl(logoUrl)) {
    throw new AppError(400, "logoUrl must be an http(s) or data:image URL and under size limits");
  }

  const doc = await Dropshipper.findOneAndUpdate(
    { userId: req.user._id },
    { $set: { labelLogoUrl: logoUrl }, $setOnInsert: { userId: req.user._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  auditLog("dropshipper_label_logo_updated", { userId: String(req.user._id) });
  res.json({ logoUrl: String(doc?.labelLogoUrl ?? logoUrl) });
});

/** Dropshipper: remove own shipping-label logo (labels fall back to global default). */
export const deleteMyLabelLogo = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "dropshipper") throw new AppError(403, "Only dropshippers can manage a personal label logo");

  await Dropshipper.findOneAndUpdate(
    { userId: req.user._id },
    { $set: { labelLogoUrl: "" } }
  );
  auditLog("dropshipper_label_logo_removed", { userId: String(req.user._id) });
  res.json({ logoUrl: "" });
});

/**
 * Resolve per-order label logos for printing.
 * Returns { [orderId]: logoUrl } for orders the caller can access.
 * Prefer dropshipper custom logo; otherwise omit (caller uses global settings).
 */
export const resolveOrderLabelLogos = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const rawIds = (req.body as { orderIds?: unknown }).orderIds;
  const orderIds = Array.isArray(rawIds)
    ? rawIds.map((id) => String(id ?? "").trim()).filter(Boolean).slice(0, 100)
    : [];
  if (!orderIds.length) {
    res.json({ logos: {} as Record<string, string> });
    return;
  }

  const visibility = await buildOrderVisibilityQuery(req.user);

  const orders = await Order.find({
    orderId: { $in: orderIds },
    ...visibility,
  })
    .select("orderId ownerUserId dropshipperId createdBy")
    .lean();

  const ownerIds = new Set<string>();
  for (const o of orders) {
    const owner = String(o.ownerUserId ?? o.dropshipperId ?? o.createdBy ?? "").trim();
    if (owner && mongoose.isValidObjectId(owner)) ownerIds.add(owner);
  }

  const dropshippers = ownerIds.size
    ? await Dropshipper.find({ userId: { $in: [...ownerIds] } })
        .select("userId labelLogoUrl")
        .lean()
    : [];
  const logoByUser = new Map<string, string>();
  for (const d of dropshippers) {
    const url = String(d.labelLogoUrl ?? "").trim();
    if (url && isAllowedLogoUrl(url)) logoByUser.set(String(d.userId), url);
  }

  const logos: Record<string, string> = {};
  for (const o of orders) {
    const owner = String(o.ownerUserId ?? o.dropshipperId ?? o.createdBy ?? "").trim();
    const logo = logoByUser.get(owner);
    if (logo) logos[o.orderId] = logo;
  }

  res.json({ logos });
});
