import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

export const IMAGE_WIDTHS = [300, 600, 800] as const;
export const WEBP_QUALITY = 78;
export const THUMB_SIZE = 300;
export const MAX_DIMENSION = 800;

export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

export interface ProductImageMeta {
  width: number;
  height: number;
  blurPlaceholder: string;
}

export interface ProcessedProductImage {
  url: string;
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

function diskDir(productId: string, index: number): string {
  return path.join(getUploadsRoot(), productId, String(index));
}

async function readInputBuffer(input: string): Promise<Buffer> {
  const trimmed = input.trim();
  if (trimmed.startsWith("data:")) {
    const match = trimmed.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) throw new Error("Invalid data URL");
    return Buffer.from(match[1], "base64");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Failed to fetch remote image (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (isOptimizedMediaPath(trimmed)) {
    const relative = trimmed.replace(MEDIA_PREFIX, "");
    const filePath = path.join(getUploadsRoot(), relative);
    return fs.readFile(filePath);
  }
  throw new Error("Unsupported image input");
}

export async function optimizeAndStore(
  productId: string,
  index: number,
  input: string
): Promise<ProcessedProductImage> {
  const buffer = await readInputBuffer(input);
  const dir = diskDir(productId, index);
  await fs.mkdir(dir, { recursive: true });

  const base = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await base.metadata();
  const origWidth = metadata.width ?? MAX_DIMENSION;
  const origHeight = metadata.height ?? MAX_DIMENSION;
  const { width, height } = displayDimensions(origWidth, origHeight);

  const blurBuffer = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(20, null, { withoutEnlargement: true, fit: "inside" })
    .webp({ quality: 20, effort: 2 })
    .toBuffer();
  const blurPlaceholder = `data:image/webp;base64,${blurBuffer.toString("base64")}`;

  await Promise.all([
    ...IMAGE_WIDTHS.map((size) =>
      sharp(buffer, { failOn: "none" })
        .rotate()
        .resize(size, size, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toFile(path.join(dir, `${size}.webp`))
    ),
    sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toFile(path.join(dir, "thumb.webp")),
  ]);

  return {
    url: mediaPath(productId, index, 800),
    meta: { width, height, blurPlaceholder },
  };
}

export async function processProductImages(
  productId: string,
  images: string[] | undefined,
  existingMeta?: ProductImageMeta[]
): Promise<{ images: string[]; imageMeta: ProductImageMeta[] }> {
  if (!Array.isArray(images) || images.length === 0) {
    return { images: [], imageMeta: [] };
  }

  const nextImages: string[] = [];
  const nextMeta: ProductImageMeta[] = [];

  for (let i = 0; i < images.length; i += 1) {
    const raw = String(images[i] ?? "").trim();
    if (!raw) continue;

    if (isOptimizedMediaPath(raw)) {
      nextImages.push(raw);
      nextMeta.push(existingMeta?.[i] ?? { width: MAX_DIMENSION, height: MAX_DIMENSION, blurPlaceholder: "" });
      continue;
    }

    if (!isLegacyImageInput(raw)) {
      nextImages.push(raw);
      nextMeta.push(existingMeta?.[i] ?? { width: MAX_DIMENSION, height: MAX_DIMENSION, blurPlaceholder: "" });
      continue;
    }

    try {
      const processed = await optimizeAndStore(productId, i, raw);
      nextImages.push(processed.url);
      nextMeta.push(processed.meta);
    } catch (error) {
      console.warn(
        `[productImage] optimize failed product=${productId} index=${i}:`,
        error instanceof Error ? error.message : String(error)
      );
      nextImages.push(raw);
      nextMeta.push(existingMeta?.[i] ?? { width: 1, height: 1, blurPlaceholder: "" });
    }
  }

  return { images: nextImages, imageMeta: nextMeta };
}

export async function ensureProductImagesOptimized(
  productId: string,
  images: string[] | undefined,
  imageMeta: ProductImageMeta[] | undefined
): Promise<{ images: string[]; imageMeta: ProductImageMeta[]; changed: boolean }> {
  const legacy = Array.isArray(images) && images.some((img) => isLegacyImageInput(String(img ?? "")));
  if (!legacy) {
    return {
      images: images ?? [],
      imageMeta: imageMeta ?? [],
      changed: false,
    };
  }
  const processed = await processProductImages(productId, images, imageMeta);
  return { ...processed, changed: true };
}

export async function deleteProductImageFiles(productId: string): Promise<void> {
  const dir = path.join(getUploadsRoot(), productId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
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
