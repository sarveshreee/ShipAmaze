import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { Product } from "../models/Product.js";
import { Vendor } from "../models/Vendor.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { pickPrimaryImageUrl } from "../utils/productListPayload.js";

function stripVendorProductFields<T extends Record<string, unknown>>(row: T): T {
  const safe = { ...row };
  delete safe.vendorSku;
  delete safe.vendor_sku;
  return safe;
}

async function canSeeVendorProductFields(req: AuthRequest, product: Record<string, unknown>): Promise<boolean> {
  if (req.user?.role === "admin") return true;
  if (req.user?.role !== "vendor") return false;
  const vendor = await Vendor.findOne({ userId: req.user._id }).select("_id").lean();
  return Boolean(vendor && String(product.vendorId ?? "") === String(vendor._id));
}

export const getProductById = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const p = await Product.findById(req.params.id).lean();
  if (!p) throw new AppError(404, "Not found");
  res.json((await canSeeVendorProductFields(req, p)) ? p : stripVendorProductFields(p));
});

export const getProductVariants = asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await Product.findById(req.params.id).select("variants").lean();
  if (!p) throw new AppError(404, "Not found");
  res.json(Array.isArray(p.variants) ? p.variants : []);
});

/** One product's primary image only — keeps list endpoints small. */
export const getProductThumbnail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const p = await Product.findById(req.params.id)
    .select("images primaryImageIndex primary_image_index vendorId uploadedBy status")
    .lean();
  if (!p) throw new AppError(404, "Not found");
  if (req.user.role === "vendor") {
    const vendor = await Vendor.findOne({ userId: req.user._id }).select("_id").lean();
    if (!vendor || String(p.vendorId ?? "") !== String(vendor._id)) {
      throw new AppError(403, "Forbidden");
    }
  } else if (req.user.role === "dropshipper") {
    if (p.status !== "active" && String(p.uploadedBy ?? "") !== String(req.user._id)) {
      throw new AppError(403, "Forbidden");
    }
  }
  res.json({ url: pickPrimaryImageUrl(p as Record<string, unknown>) });
});
