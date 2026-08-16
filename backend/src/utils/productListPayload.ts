import type { PipelineStage } from "mongoose";

const LISTABLE_PRODUCT_IMAGE_REGEX =
  "^(https://res\\.cloudinary\\.com/|https://|http://|/api/media/|/media/)";

const productListImagesProjection = {
  $let: {
    vars: {
      allImages: {
        $cond: [{ $isArray: "$images" }, "$images", []],
      },
      rawIndex: { $ifNull: ["$primaryImageIndex", 0] },
    },
    in: {
      $let: {
        vars: {
          safeIndex: {
            $cond: [
              { $gte: [{ $size: "$$allImages" }, 1] },
              {
                $max: [
                  0,
                  {
                    $min: [
                      "$$rawIndex",
                      { $subtract: [{ $size: "$$allImages" }, 1] },
                    ],
                  },
                ],
              },
              0,
            ],
          },
        },
        in: {
          $let: {
            vars: {
              primary: { $arrayElemAt: ["$$allImages", "$$safeIndex"] },
            },
            in: {
              $let: {
                vars: {
                  primaryUrl: {
                    $convert: {
                      input: {
                        $switch: {
                          branches: [
                            {
                              case: { $eq: [{ $type: "$$primary" }, "string"] },
                              then: "$$primary",
                            },
                            {
                              case: { $eq: [{ $type: "$$primary" }, "object"] },
                              then: {
                                $ifNull: [
                                  "$$primary.secureUrl",
                                  {
                                    $ifNull: [
                                      "$$primary.secure_url",
                                      { $ifNull: ["$$primary.url", "$$primary.path"] },
                                    ],
                                  },
                                ],
                              },
                            },
                          ],
                          default: "",
                        },
                      },
                      to: "string",
                      onError: "",
                      onNull: "",
                    },
                  },
                },
                in: {
                  $cond: [
                    {
                      $regexMatch: {
                        input: "$$primaryUrl",
                        regex: LISTABLE_PRODUCT_IMAGE_REGEX,
                      },
                    },
                    ["$$primaryUrl"],
                    { $literal: [] },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
};

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
    $gt: [{ $size: { $cond: [{ $isArray: "$images" }, "$images", []] } }, 0],
  },
  // Omit heavy base64 blobs; include short Cloudinary HTTPS URLs for fast grid thumbnails.
  images: productListImagesProjection,
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

export function pickPrimaryImageIndex(row: Record<string, unknown>): number {
  const images = row.images;
  if (!Array.isArray(images) || images.length === 0) return 0;
  const idx = Number(row.primaryImageIndex ?? row.primary_image_index ?? 0);
  return Number.isFinite(idx) ? Math.max(0, Math.min(idx, images.length - 1)) : 0;
}

export function pickPrimaryImageUrl(row: Record<string, unknown>): string | null {
  const images = row.images;
  if (!Array.isArray(images) || images.length === 0) return null;
  const primary = images[pickPrimaryImageIndex(row)];
  const url = typeof primary === "object" && primary !== null
    ? String((primary as { secureUrl?: unknown; secure_url?: unknown; url?: unknown; path?: unknown }).secureUrl
        ?? (primary as { secure_url?: unknown }).secure_url
        ?? (primary as { url?: unknown }).url
        ?? (primary as { path?: unknown }).path
        ?? "").trim()
    : String(primary ?? "").trim();
  if (!url) return null;
  if (url.includes("/media/products/") && url.endsWith(".webp")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("data:") || url.length > 200) return url;
  return url;
}
