import fs from "fs/promises";
import path from "path";
import { AppError } from "../middleware/errorMiddleware.js";
import {
  deleteCloudinaryImages,
  normalizeCloudinaryImage,
  productImagePublicId,
  productImageUrl,
  uploadDataUrlImage,
  uploadRemoteImage,
  type CloudinaryProductImage,
  type ProductImageValue,
} from "./cloudinary.service.js";

export const IMAGE_WIDTHS = [300, 600, 800] as const;
export const MAX_DIMENSION = 800;

export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

export interface ProductImageMeta {
  width: number;
  height: number;
  blurPlaceholder: string;
}

export interface ProcessedProductImage {
  image: CloudinaryProductImage;
  meta: ProductImageMeta;
}

const MEDIA_PREFIX = "/media/products/";

export function getUploadsRoot(): string {
  const configured = process.env.PRODUCT_UPLOADS_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), "uploads", "products");
}

export function mediaPath(productId: string, index: number, size: ImageWidth | "thumb"): string {
  const file = size === "thumb" ? "thumb.webp" : `${size}.webp`;
  return `${MEDIA_PREFIX}${productId}/${index}/${file}`;
}

export function isOptimizedMediaPath(value: string): boolean {
  return value.includes(MEDIA_PREFIX) && value.endsWith(".webp");
}

export function isLegacyImageInput(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  if (url.startsWith("data:")) return true;
  if (/^https?:\/\//i.test(url)) return true;
  return !isOptimizedMediaPath(url);
}

export function displayDimensions(origWidth: number, origHeight: number): { width: number; height: number } {
  if (origWidth <= 0 || origHeight <= 0) return { width: MAX_DIMENSION, height: MAX_DIMENSION };
  const scale = Math.min(1, MAX_DIMENSION / Math.max(origWidth, origHeight));
  return {
    width: Math.max(1, Math.round(origWidth * scale)),
    height: Math.max(1, Math.round(origHeight * scale)),
  };
}

export function buildSrcSet(productId: string, index: number): string {
  return IMAGE_WIDTHS.map((w) => `${mediaPath(productId, index, w)} ${w}w`).join(", ");
}

export const RESPONSIVE_SIZES = "(max-width: 480px) 300px, (max-width: 960px) 600px, 800px";

export async function processProductImages(
  images: ProductImageValue[] | undefined,
  existingImages: ProductImageValue[] = [],
  existingMeta?: ProductImageMeta[]
): Promise<{ images: ProductImageValue[]; imageMeta: ProductImageMeta[]; uploaded: CloudinaryProductImage[] }> {
  if (!Array.isArray(images) || images.length === 0) {
    return { images: [], imageMeta: [], uploaded: [] };
  }

  const existingUrls = new Set(
    existingImages.map((image) => productImageUrl(image)).filter((value): value is string => Boolean(value))
  );
  const nextImages: ProductImageValue[] = [];
  const nextMeta: ProductImageMeta[] = [];
  const uploaded: CloudinaryProductImage[] = [];

  try {
    for (let i = 0; i < images.length; i += 1) {
      const input = images[i];
      const existingCloudinary = normalizeCloudinaryImage(input);
      if (existingCloudinary) {
        nextImages.push(existingCloudinary);
        nextMeta.push(existingMeta?.[i] ?? { width: MAX_DIMENSION, height: MAX_DIMENSION, blurPlaceholder: "" });
        continue;
      }

      const raw = productImageUrl(input);
      if (!raw) continue;

      if (existingUrls.has(raw)) {
        nextImages.push(raw);
        nextMeta.push(existingMeta?.[i] ?? { width: MAX_DIMENSION, height: MAX_DIMENSION, blurPlaceholder: "" });
        continue;
      }

      if (raw.startsWith("data:")) {
        const image = await uploadDataUrlImage(raw);
        uploaded.push(image);
        nextImages.push(image);
        nextMeta.push({ width: MAX_DIMENSION, height: MAX_DIMENSION, blurPlaceholder: "" });
      } else if (/^https?:\/\//i.test(raw)) {
        const image = await uploadRemoteImage(raw);
        uploaded.push(image);
        nextImages.push(image);
        nextMeta.push({ width: MAX_DIMENSION, height: MAX_DIMENSION, blurPlaceholder: "" });
      } else {
        throw new AppError(400, "Unsupported image input");
      }
    }
  } catch (error) {
    await deleteCloudinaryImages(uploaded);
    throw error;
  }

  return { images: nextImages, imageMeta: nextMeta, uploaded };
}

export async function deleteRemovedProductImages(
  previousImages: ProductImageValue[] | undefined,
  nextImages: ProductImageValue[] | undefined
): Promise<void> {
  const keep = new Set(
    (nextImages ?? [])
      .map((image) => productImagePublicId(image))
      .filter((publicId): publicId is string => Boolean(publicId))
  );
  const removed = (previousImages ?? []).filter((image) => {
    const publicId = productImagePublicId(image);
    return publicId && !keep.has(publicId);
  });
  await deleteCloudinaryImages(removed);
}

export async function deleteProductImages(productId: string, images?: ProductImageValue[]): Promise<void> {
  await Promise.all([
    deleteCloudinaryImages(images ?? []),
    fs.rm(path.join(getUploadsRoot(), productId), { recursive: true, force: true }).catch(() => undefined),
  ]);
}

export async function ensureProductImagesOptimized(
  _productId: string,
  images: ProductImageValue[] | undefined,
  imageMeta: ProductImageMeta[] | undefined
): Promise<{ images: ProductImageValue[]; imageMeta: ProductImageMeta[]; changed: boolean }> {
  const legacy = Array.isArray(images) && images.some((img) => isLegacyImageInput(productImageUrl(img) ?? ""));
  if (!legacy) {
    return {
      images: images ?? [],
      imageMeta: imageMeta ?? [],
      changed: false,
    };
  }
  const processed = await processProductImages(images, images, imageMeta);
  return { images: processed.images, imageMeta: processed.imageMeta, changed: true };
}

export async function deleteProductImageFiles(productId: string): Promise<void> {
  await fs.rm(path.join(getUploadsRoot(), productId), { recursive: true, force: true }).catch(() => undefined);
}

export async function readOptimizedImageFile(
  productId: string,
  index: number,
  size: ImageWidth | "thumb"
): Promise<Buffer | null> {
  const file = size === "thumb" ? "thumb.webp" : `${size}.webp`;
  const filePath = path.join(getUploadsRoot(), productId, String(index), file);
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export function buildPublicImagePath(productId: string, index: number, size: ImageWidth | "thumb"): string {
  const file = size === "thumb" ? "thumb.webp" : `${size}.webp`;
  return `/products/image/${productId}/${index}/${file}?v=2`;
}

export function buildPublicSrcSet(productId: string, index: number): string {
  return IMAGE_WIDTHS.map((width) => `${buildPublicImagePath(productId, index, width)} ${width}w`).join(", ");
}
