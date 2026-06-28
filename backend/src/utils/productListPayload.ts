import type { PipelineStage } from "mongoose";

/** Fields needed for product grids/tables — never load image bytes on list endpoints. */
export const PRODUCT_LIST_PROJECT: Record<string, 1 | unknown> = {
  name: 1,
  sku: 1,
  vendorSku: 1,
  category: 1,
  categories: 1,
  brand: 1,
  status: 1,
  price: 1,
  sellingPrice: 1,
  shippingCharge: 1,
  ourCommission: 1,
  stock: 1,
  weight: 1,
  dimensions: 1,
  hsn: 1,
  tags: 1,
  unit: 1,
  minOrderQty: 1,
  min_order_qty: 1,
  vendorId: 1,
  vendorName: 1,
  uploadedBy: 1,
  uploadedByRole: 1,
  primaryImageIndex: 1,
  primary_image_index: 1,
  length_cm: 1,
  width_cm: 1,
  height_cm: 1,
  lengthCm: 1,
  widthCm: 1,
  heightCm: 1,
  shipping_class: 1,
  shippingClass: 1,
  pickup_location_id: 1,
  pickupLocationId: 1,
  cod_available: 1,
  codAvailable: 1,
  returnable: 1,
  fragile: 1,
  gst_percent: 1,
  gstPercent: 1,
  country_of_origin: 1,
  countryOfOrigin: 1,
  warranty: 1,
  manufacturer: 1,
  isFeatured: 1,
  createdAt: 1,
  updatedAt: 1,
  hasImage: {
    $gt: [{ $size: { $ifNull: ["$images", []] } }, 0],
  },
  // Image bytes (often base64) are loaded only via GET /products/:id/thumbnail or detail.
  images: { $literal: [] },
};

export function buildProductListPipeline(
  match: Record<string, unknown>,
  sort: Record<string, 1 | -1> = { createdAt: -1 },
  opts?: { skip?: number; limit?: number; includeDescriptions?: boolean }
): PipelineStage[] {
  const project: Record<string, 1 | unknown> = { ...PRODUCT_LIST_PROJECT };
  if (opts?.includeDescriptions) {
    project.short_description = 1;
    project.shortDescription = 1;
    project.long_description = 1;
    project.longDescription = 1;
    project.seo_title = 1;
    project.seoTitle = 1;
    project.seo_description = 1;
    project.seoDescription = 1;
    project.care_instructions = 1;
    project.careInstructions = 1;
  }

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $sort: sort },
  ];
  if (opts?.skip != null) pipeline.push({ $skip: opts.skip });
  if (opts?.limit != null) pipeline.push({ $limit: opts.limit });
  pipeline.push({ $project: project });
  return pipeline;
}

export function pickPrimaryImageUrl(row: Record<string, unknown>): string | null {
  const images = row.images;
  if (!Array.isArray(images) || images.length === 0) return null;
  const idx = Number(row.primaryImageIndex ?? row.primary_image_index ?? 0);
  const primary = images[Number.isFinite(idx) ? Math.max(0, Math.min(idx, images.length - 1)) : 0];
  const url = String(primary ?? "").trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("data:") || url.length > 200) return url;
  return url || null;
}
