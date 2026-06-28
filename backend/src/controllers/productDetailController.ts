import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { Product } from "../models/Product.js";
import { Vendor } from "../models/Vendor.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { pickPrimaryImageUrl, pickPrimaryImageIndex } from "../utils/productListPayload.js";
import type { ProductImageMeta } from "../services/productImageService.js";
import { resolveProductImageResponse } from "../utils/productImageResponse.js";

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

async function assertProductImageAccess(req: AuthRequest, product: Record<string, unknown>): Promise<void> {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role === "vendor") {
    const vendor = await Vendor.findOne({ userId: req.user._id }).select("_id").lean();
    if (!vendor || String(product.vendorId ?? "") !== String(vendor._id)) {
      throw new AppError(403, "Forbidden");
    }
    return;
  }
  if (req.user.role === "dropshipper") {
    if (product.status !== "active" && String(product.uploadedBy ?? "") !== String(req.user._id)) {
      throw new AppError(403, "Forbidden");
    }
  }
}

export const getProductById = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const p = await Product.findById(req.params.id).lean();
  if (!p) throw new AppError(404, "Not found");
  res.json((await canSeeVendorProductFields(req, p as Record<string, unknown>)) ? p : stripVendorProductFields(p as Record<string, unknown>));
});

export const getProductVariants = asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await Product.findById(req.params.id).select("variants").lean();
  if (!p) throw new AppError(404, "Not found");
  res.json(Array.isArray(p.variants) ? p.variants : []);
});

/** Primary image metadata for grids — keeps list endpoints small. */
export const getProductThumbnail = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const p = await Product.findById(req.params.id)
    .select("images imageMeta primaryImageIndex primary_image_index vendorId uploadedBy status")
    .lean();
  if (!p) throw new AppError(404, "Not found");
  await assertProductImageAccess(req, p as Record<string, unknown>);

  const row = p as Record<string, unknown>;
  const images = Array.isArray(row.images) ? (row.images as string[]) : [];
  const requestedIndex = Number(req.query.index ?? pickPrimaryImageIndex(row));
  const imageIndex = Number.isFinite(requestedIndex)
    ? Math.max(0, Math.min(requestedIndex, Math.max(0, images.length - 1)))
    : pickPrimaryImageIndex(row);
  const imageMeta = Array.isArray(row.imageMeta) ? (row.imageMeta as ProductImageMeta[]) : undefined;
  const primaryUrl = images[imageIndex] ? String(images[imageIndex]).trim() : pickPrimaryImageUrl(row);
  const meta = imageMeta?.[imageIndex];

  res.setHeader("Cache-Control", "private, max-age=300");
  res.json(
    await resolveProductImageResponse(String(row._id ?? req.params.id), imageIndex, primaryUrl, meta)
  );
});
