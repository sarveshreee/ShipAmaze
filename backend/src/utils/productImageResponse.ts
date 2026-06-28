import fs from "fs/promises";
import path from "path";
import {
  RESPONSIVE_SIZES,
  getUploadsRoot,
  buildPublicImagePath,
  buildPublicSrcSet,
  type ProductImageMeta,
} from "../services/productImageService.js";

export interface ProductImageResponse {
  url: string | null;
  thumb: string | null;
  srcset: string | null;
  sizes: string;
  width: number;
  height: number;
  blurPlaceholder: string | null;
}

async function hasOptimizedFiles(productId: string, imageIndex: number): Promise<boolean> {
  const filePath = path.join(getUploadsRoot(), productId, String(imageIndex), "800.webp");
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveProductImageResponse(
  productId: string,
  imageIndex: number,
  primaryUrl: string | null,
  meta?: ProductImageMeta
): Promise<ProductImageResponse> {
  if (!primaryUrl) {
    return {
      url: null,
      thumb: null,
      srcset: null,
      sizes: RESPONSIVE_SIZES,
      width: 1,
      height: 1,
      blurPlaceholder: null,
    };
  }

  const width = meta?.width && meta.width > 0 ? meta.width : 800;
  const height = meta?.height && meta.height > 0 ? meta.height : 800;
  const optimizedReady =
    primaryUrl.includes("/media/products/") || (await hasOptimizedFiles(productId, imageIndex));

  return {
    url: buildPublicImagePath(productId, imageIndex, 800),
    thumb: buildPublicImagePath(productId, imageIndex, "thumb"),
    srcset: optimizedReady ? buildPublicSrcSet(productId, imageIndex) : null,
    sizes: RESPONSIVE_SIZES,
    width,
    height,
    blurPlaceholder: meta?.blurPlaceholder ?? null,
  };
}
