import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { getUploadsRoot } from "./productImageService.js";
import {
  PRODUCT_IMAGE_FOLDER,
  normalizeCloudinaryImage,
  productImageUrl,
  type CloudinaryProductImage,
  type ProductImageValue,
} from "./cloudinary.service.js";

export interface ImageMigrationEntry {
  index: number;
  status: "uploaded" | "skipped" | "failed";
  source: string;
  publicId?: string;
  secureUrl?: string;
  reason?: string;
}

export interface ProductMigrationBatchLog {
  productId: string;
  productName: string;
  uploaded: ImageMigrationEntry[];
  skipped: ImageMigrationEntry[];
  failed: ImageMigrationEntry[];
}

export interface MigrationBatchResult {
  done: boolean;
  nextCursor: string | null;
  processed: number;
  productsUpdated: number;
  imagesUploaded: number;
  imagesSkipped: number;
  imagesFailed: number;
  products: ProductMigrationBatchLog[];
  removableLocalFiles: string[];
}

export interface MigrationVerificationResult {
  ok: boolean;
  remainingLegacyProducts: number;
  checkedProducts: number;
  samples: Array<{ productId: string; productName: string; legacyImages: string[] }>;
}

const uploadCache = new Map<string, CloudinaryProductImage>();

function sha256(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isCloudinaryUrl(url: string): boolean {
  return /\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//i.test(url);
}

function stripExtension(publicPath: string): string {
  return publicPath.replace(/\.[a-z0-9]+$/i, "");
}

function cloudinaryImageFromUrl(url: string): CloudinaryProductImage | null {
  if (!isCloudinaryUrl(url)) return null;
  const withoutQuery = url.split(/[?#]/)[0];
  const marker = "/image/upload/";
  const markerIndex = withoutQuery.indexOf(marker);
  if (markerIndex < 0) return null;
  const uploadPath = withoutQuery.slice(markerIndex + marker.length);
  const folderIndex = uploadPath.indexOf(`${PRODUCT_IMAGE_FOLDER}/`);
  const publicPath = folderIndex >= 0
    ? uploadPath.slice(folderIndex)
    : uploadPath.replace(/^(?:[^/]+\/)*v\d+\//, "");
  const publicId = stripExtension(decodeURIComponent(publicPath));
  return publicId ? { publicId, secureUrl: url } : null;
}

function existingCloudinaryImage(value: ProductImageValue): CloudinaryProductImage | null {
  const normalized = normalizeCloudinaryImage(value);
  if (normalized) return normalized;
  const url = productImageUrl(value);
  return url ? cloudinaryImageFromUrl(url) : null;
}

function shortSource(value: unknown): string {
  const url = productImageUrl(value as ProductImageValue);
  if (url) return url.length > 180 ? `${url.slice(0, 177)}...` : url;
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, 180);
  return String(value ?? "");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function pathFromUrlLike(raw: string): string {
  try {
    return new URL(raw).pathname;
  } catch {
    return raw;
  }
}

function joinPublicUrl(publicBaseUrl: string, imagePath: string): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  const normalized = imagePath.startsWith("/api/") ? imagePath : `/api${imagePath.startsWith("/") ? imagePath : `/${imagePath}`}`;
  return `${base}${normalized}`;
}

async function localFileForImagePath(rawSource: string): Promise<string | null> {
  const raw = rawSource.trim();
  if (!raw || raw.startsWith("data:")) return null;
  const pathname = decodeURIComponent(pathFromUrlLike(raw)).replace(/\\/g, "/");
  const candidates: string[] = [];

  const mediaMatch = pathname.match(/(?:\/api)?\/media\/products\/(.+)$/);
  if (mediaMatch) candidates.push(path.join(getUploadsRoot(), mediaMatch[1]));

  const productImageMatch = pathname.match(/(?:\/api)?\/products\/image\/([^/]+)\/(\d+)\/([^/?#]+)$/);
  if (productImageMatch) {
    candidates.push(path.join(getUploadsRoot(), productImageMatch[1], productImageMatch[2], productImageMatch[3]));
  }

  const uploadsMatch = pathname.match(/(?:\/api)?\/uploads\/(.+)$/);
  if (uploadsMatch) candidates.push(path.resolve(process.cwd(), "uploads", uploadsMatch[1]));

  if (path.isAbsolute(raw)) candidates.push(raw);
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith("/")) {
    candidates.push(path.resolve(process.cwd(), raw), path.resolve(process.cwd(), "uploads", raw));
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return path.resolve(candidate);
  }
  return null;
}

function publicFallbackUrl(rawSource: string, publicBaseUrl: string): string | null {
  const raw = rawSource.trim();
  if (!raw || raw.startsWith("data:")) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const pathname = pathFromUrlLike(raw).replace(/\\/g, "/");
  if (/^(?:\/api)?\/(?:media\/products|uploads|products\/image)\//i.test(pathname)) {
    return joinPublicUrl(publicBaseUrl, pathname);
  }
  return null;
}

function uploadStream(buffer: Buffer, options: UploadApiOptions): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) {
        reject(error ?? new Error("Cloudinary upload failed"));
        return;
      }
      resolve(result);
    });
    stream.end(buffer);
  });
}

async function uploadBufferOnce(buffer: Buffer): Promise<CloudinaryProductImage> {
  const hash = sha256(buffer);
  const cacheKey = `buffer:${hash}`;
  const cached = uploadCache.get(cacheKey);
  if (cached) return cached;

  const publicId = `${PRODUCT_IMAGE_FOLDER}/migrated/${hash}`;
  const result = await uploadStream(buffer, {
    public_id: publicId,
    resource_type: "image",
    overwrite: true,
    unique_filename: false,
  });
  const image = { publicId: result.public_id, secureUrl: result.secure_url };
  uploadCache.set(cacheKey, image);
  return image;
}

async function uploadRemoteUrlOnce(url: string): Promise<CloudinaryProductImage> {
  const hash = sha256(url.trim());
  const cacheKey = `remote:${hash}`;
  const cached = uploadCache.get(cacheKey);
  if (cached) return cached;

  const publicId = `${PRODUCT_IMAGE_FOLDER}/migrated/remote-${hash}`;
  const result = await cloudinary.uploader.upload(url, {
    public_id: publicId,
    resource_type: "image",
    overwrite: true,
    unique_filename: false,
  });
  const image = { publicId: result.public_id, secureUrl: result.secure_url };
  uploadCache.set(cacheKey, image);
  return image;
}

async function migrateOneImage(
  value: ProductImageValue,
  index: number,
  publicBaseUrl: string,
  removableLocalFiles: Set<string>
): Promise<{ nextImage: ProductImageValue; entry: ImageMigrationEntry }> {
  const source = shortSource(value);
  const cloudinaryImage = existingCloudinaryImage(value);
  if (cloudinaryImage) {
    return {
      nextImage: cloudinaryImage,
      entry: { index, status: "skipped", source, reason: "already Cloudinary", ...cloudinaryImage },
    };
  }

  const rawUrl = productImageUrl(value);
  if (!rawUrl) {
    return { nextImage: value, entry: { index, status: "failed", source, reason: "empty image value" } };
  }

  try {
    if (rawUrl.startsWith("data:")) {
      const match = rawUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (!match) throw new Error("Invalid data URL");
      const image = await uploadBufferOnce(Buffer.from(match[1].replace(/\s/g, ""), "base64"));
      return { nextImage: image, entry: { index, status: "uploaded", source: "data URL", ...image } };
    }

    const localFile = await localFileForImagePath(rawUrl);
    if (localFile) {
      const image = await uploadBufferOnce(await fs.readFile(localFile));
      removableLocalFiles.add(localFile);
      return { nextImage: image, entry: { index, status: "uploaded", source: localFile, ...image } };
    }

    const fallbackUrl = publicFallbackUrl(rawUrl, publicBaseUrl);
    if (fallbackUrl) {
      const image = await uploadRemoteUrlOnce(fallbackUrl);
      return { nextImage: image, entry: { index, status: "uploaded", source: fallbackUrl, ...image } };
    }

    throw new Error("Local file not found and no public URL fallback available");
  } catch (error) {
    return {
      nextImage: value,
      entry: {
        index,
        status: "failed",
        source,
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function hasLegacyImageMetaReference(imageMeta: unknown): boolean {
  if (!imageMeta) return false;
  return /\/media\/products\/|\/uploads\/|\\uploads\\/i.test(JSON.stringify(imageMeta));
}

function isLegacyImageValue(value: ProductImageValue): boolean {
  if (existingCloudinaryImage(value)) return false;
  return Boolean(productImageUrl(value)?.trim());
}

export async function runCloudinaryMigrationBatch(options: {
  limit: number;
  after?: string;
  publicBaseUrl: string;
  requestedBy?: string;
}): Promise<MigrationBatchResult> {
  const limit = Math.max(1, Math.min(options.limit, 25));
  const query: Record<string, unknown> = {};
  if (options.after && mongoose.Types.ObjectId.isValid(options.after)) {
    query._id = { $gt: new mongoose.Types.ObjectId(options.after) };
  }

  const products = await Product.find(query, { name: 1, images: 1, imageMeta: 1 })
    .sort({ _id: 1 })
    .limit(limit)
    .exec();

  const removableLocalFiles = new Set<string>();
  const result: MigrationBatchResult = {
    done: products.length < limit,
    nextCursor: products.at(-1)?._id ? String(products.at(-1)!._id) : null,
    processed: products.length,
    productsUpdated: 0,
    imagesUploaded: 0,
    imagesSkipped: 0,
    imagesFailed: 0,
    products: [],
    removableLocalFiles: [],
  };

  for (const product of products) {
    const productLog: ProductMigrationBatchLog = {
      productId: String(product._id),
      productName: String(product.name ?? ""),
      uploaded: [],
      skipped: [],
      failed: [],
    };

    try {
      const currentImages = Array.isArray(product.images) ? (product.images as ProductImageValue[]) : [];
      const nextImages: ProductImageValue[] = [];
      for (let index = 0; index < currentImages.length; index += 1) {
        const migrated = await migrateOneImage(currentImages[index], index, options.publicBaseUrl, removableLocalFiles);
        nextImages.push(migrated.nextImage);
        productLog[migrated.entry.status].push(migrated.entry);
      }

      const changedImages = JSON.stringify(currentImages) !== JSON.stringify(nextImages);
      const clearImageMeta = hasLegacyImageMetaReference(product.get("imageMeta")) || changedImages;
      if (changedImages || clearImageMeta) {
        const update: Record<string, unknown> = { images: nextImages };
        if (clearImageMeta) update.imageMeta = [];
        await Product.updateOne({ _id: product._id }, { $set: update });
        result.productsUpdated += 1;
      }
    } catch (error) {
      productLog.failed.push({
        index: -1,
        status: "failed",
        source: "product",
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    result.imagesUploaded += productLog.uploaded.length;
    result.imagesSkipped += productLog.skipped.length;
    result.imagesFailed += productLog.failed.length;
    result.products.push(productLog);
  }

  result.removableLocalFiles = Array.from(removableLocalFiles).sort();
  await mongoose.connection.collection("cloudinaryMigrationLogs").insertOne({
    type: "batch",
    requestedBy: options.requestedBy,
    createdAt: new Date(),
    after: options.after ?? null,
    publicBaseUrl: options.publicBaseUrl,
    result,
  });

  return result;
}

export async function verifyCloudinaryMigration(limit = 50): Promise<MigrationVerificationResult> {
  const samples: MigrationVerificationResult["samples"] = [];
  let checkedProducts = 0;
  let remainingLegacyProducts = 0;
  const cursor = Product.find({}, { name: 1, images: 1, imageMeta: 1 }).lean().cursor();

  for await (const product of cursor) {
    checkedProducts += 1;
    const images = Array.isArray(product.images) ? (product.images as ProductImageValue[]) : [];
    const legacyImages = images.filter(isLegacyImageValue).map(shortSource);
    if (hasLegacyImageMetaReference((product as Record<string, unknown>).imageMeta)) {
      legacyImages.push("imageMeta contains legacy local reference");
    }
    if (legacyImages.length > 0) {
      remainingLegacyProducts += 1;
      if (samples.length < limit) {
        samples.push({
          productId: String(product._id),
          productName: String(product.name ?? ""),
          legacyImages,
        });
      }
    }
  }

  const result = {
    ok: remainingLegacyProducts === 0,
    remainingLegacyProducts,
    checkedProducts,
    samples,
  };
  await mongoose.connection.collection("cloudinaryMigrationLogs").insertOne({
    type: "verification",
    createdAt: new Date(),
    result,
  });
  return result;
}
