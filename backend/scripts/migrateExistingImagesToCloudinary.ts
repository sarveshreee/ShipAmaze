import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { connectDb, disconnectDb } from "../src/config/db.js";
import { Product } from "../src/models/Product.js";
import { getUploadsRoot } from "../src/services/productImageService.js";
import {
  PRODUCT_IMAGE_FOLDER,
  normalizeCloudinaryImage,
  productImageUrl,
  type CloudinaryProductImage,
  type ProductImageValue,
} from "../src/services/cloudinary.service.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

type ImageMigrationStatus = "uploaded" | "skipped" | "failed";

interface ImageMigrationEntry {
  index: number;
  status: ImageMigrationStatus;
  source: string;
  publicId?: string;
  secureUrl?: string;
  reason?: string;
}

interface ProductMigrationLog {
  productId: string;
  productName: string;
  uploaded: ImageMigrationEntry[];
  skipped: ImageMigrationEntry[];
  failed: ImageMigrationEntry[];
}

interface MigrationLog {
  startedAt: string;
  finishedAt?: string;
  totals: {
    productsSeen: number;
    productsUpdated: number;
    imagesUploaded: number;
    imagesSkipped: number;
    imagesFailed: number;
    remainingLegacyProducts: number;
  };
  products: ProductMigrationLog[];
  removableLocalFiles: string[];
  verification: {
    ok: boolean;
    remainingLegacyProducts: Array<{ productId: string; productName: string; legacyImages: string[] }>;
  };
}

interface LocalSource {
  filePath: string;
  displayPath: string;
}

const uploadCache = new Map<string, CloudinaryProductImage>();
const removableLocalFiles = new Set<string>();

function writeMode(): "object" | "secureUrl" {
  const mode = process.env.CLOUDINARY_MIGRATION_WRITE_MODE?.trim().toLowerCase();
  return mode === "secureurl" || mode === "url" || mode === "string" ? "secureUrl" : "object";
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function shortSource(value: unknown): string {
  const url = productImageUrl(value as ProductImageValue);
  if (url) return url.length > 180 ? `${url.slice(0, 177)}...` : url;
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, 180);
  return String(value ?? "");
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

function sha256(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
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

function publicBaseUrl(): string | null {
  return (
    process.env.PUBLIC_BACKEND_URL?.trim()
    || process.env.API_PUBLIC_URL?.trim()
    || process.env.RENDER_EXTERNAL_URL?.trim()
    || null
  );
}

function joinPublicUrl(baseUrl: string, imagePath: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const normalized = imagePath.startsWith("/api/")
    ? imagePath
    : `/api${imagePath.startsWith("/") ? imagePath : `/${imagePath}`}`;
  return `${base}${normalized}`;
}

async function resolveLocalSource(rawSource: string): Promise<LocalSource | null> {
  const raw = rawSource.trim();
  if (!raw || raw.startsWith("data:")) return null;

  const pathname = decodeURIComponent(pathFromUrlLike(raw)).replace(/\\/g, "/");
  const candidates: LocalSource[] = [];

  const mediaMatch = pathname.match(/(?:\/api)?\/media\/products\/(.+)$/);
  if (mediaMatch) {
    candidates.push({
      filePath: path.join(getUploadsRoot(), mediaMatch[1]),
      displayPath: pathname,
    });
  }

  const productImageMatch = pathname.match(/(?:\/api)?\/products\/image\/([^/]+)\/(\d+)\/([^/?#]+)$/);
  if (productImageMatch) {
    candidates.push({
      filePath: path.join(getUploadsRoot(), productImageMatch[1], productImageMatch[2], productImageMatch[3]),
      displayPath: pathname,
    });
  }

  const uploadsMatch = pathname.match(/(?:\/api)?\/uploads\/(.+)$/);
  if (uploadsMatch) {
    candidates.push({
      filePath: path.resolve(process.cwd(), "uploads", uploadsMatch[1]),
      displayPath: pathname,
    });
  }

  if (path.isAbsolute(raw)) {
    candidates.push({ filePath: raw, displayPath: raw });
  }

  if (!/^https?:\/\//i.test(raw) && !raw.startsWith("/")) {
    candidates.push(
      { filePath: path.resolve(process.cwd(), raw), displayPath: raw },
      { filePath: path.resolve(process.cwd(), "uploads", raw), displayPath: raw }
    );
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate.filePath)) {
      return {
        filePath: path.resolve(candidate.filePath),
        displayPath: candidate.displayPath,
      };
    }
  }

  return null;
}

function publicFallbackUrl(rawSource: string): string | null {
  const baseUrl = publicBaseUrl();
  if (!baseUrl) return null;
  const raw = rawSource.trim();
  if (!raw || raw.startsWith("data:")) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const pathname = pathFromUrlLike(raw).replace(/\\/g, "/");
  if (/^(?:\/api)?\/(?:media\/products|uploads|products\/image)\//i.test(pathname)) {
    return joinPublicUrl(baseUrl, pathname);
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
  const normalizedUrl = url.trim();
  const response = await fetch(normalizedUrl, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`Failed to fetch remote image (${response.status})`);
  return uploadBufferOnce(Buffer.from(await response.arrayBuffer()));
}

function storedImageValue(image: CloudinaryProductImage): ProductImageValue {
  return writeMode() === "secureUrl" ? image.secureUrl : image;
}

async function migrateOneImage(value: ProductImageValue, index: number): Promise<{
  nextImage: ProductImageValue;
  entry: ImageMigrationEntry;
}> {
  const source = shortSource(value);
  const cloudinaryImage = existingCloudinaryImage(value);
  if (cloudinaryImage) {
    return {
      nextImage: storedImageValue(cloudinaryImage),
      entry: {
        index,
        status: "skipped",
        source,
        publicId: cloudinaryImage.publicId,
        secureUrl: cloudinaryImage.secureUrl,
        reason: "already Cloudinary",
      },
    };
  }

  const rawUrl = productImageUrl(value);
  if (!rawUrl) {
    return {
      nextImage: value,
      entry: { index, status: "failed", source, reason: "empty or unsupported image value" },
    };
  }

  try {
    if (rawUrl.startsWith("data:")) {
      const match = rawUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (!match) throw new Error("Invalid data URL");
      const image = await uploadBufferOnce(Buffer.from(match[1].replace(/\s/g, ""), "base64"));
      return {
        nextImage: storedImageValue(image),
        entry: { index, status: "uploaded", source: "data URL", ...image },
      };
    }

    const localSource = await resolveLocalSource(rawUrl);
    if (localSource) {
      const buffer = await fs.readFile(localSource.filePath);
      const image = await uploadBufferOnce(buffer);
      removableLocalFiles.add(localSource.filePath);
      return {
        nextImage: storedImageValue(image),
        entry: { index, status: "uploaded", source: localSource.displayPath, ...image },
      };
    }

    const fallbackUrl = publicFallbackUrl(rawUrl);
    if (fallbackUrl) {
      const image = await uploadRemoteUrlOnce(fallbackUrl);
      return {
        nextImage: storedImageValue(image),
        entry: { index, status: "uploaded", source: fallbackUrl, ...image },
      };
    }

    if (/^https?:\/\//i.test(rawUrl)) {
      const image = await uploadRemoteUrlOnce(rawUrl);
      return {
        nextImage: storedImageValue(image),
        entry: { index, status: "uploaded", source: rawUrl, ...image },
      };
    }

    throw new Error(
      "Local file not found and no PUBLIC_BACKEND_URL/API_PUBLIC_URL/RENDER_EXTERNAL_URL fallback is configured"
    );
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
  const text = JSON.stringify(imageMeta);
  return /\/media\/products\/|\/uploads\/|\\uploads\\/i.test(text);
}

function isLegacyImageValue(value: ProductImageValue): boolean {
  if (existingCloudinaryImage(value)) return false;
  const url = productImageUrl(value);
  return Boolean(url?.trim());
}

async function verifyProducts(): Promise<MigrationLog["verification"]> {
  const remainingLegacyProducts: MigrationLog["verification"]["remainingLegacyProducts"] = [];
  const cursor = Product.find({}, { name: 1, images: 1, imageMeta: 1 }).lean().cursor();

  for await (const product of cursor) {
    const images = Array.isArray(product.images) ? (product.images as ProductImageValue[]) : [];
    const legacyImages = images.filter(isLegacyImageValue).map(shortSource);
    if (hasLegacyImageMetaReference((product as Record<string, unknown>).imageMeta)) {
      legacyImages.push("imageMeta contains legacy local reference");
    }
    if (legacyImages.length > 0) {
      remainingLegacyProducts.push({
        productId: String(product._id),
        productName: String(product.name ?? ""),
        legacyImages,
      });
    }
  }

  return {
    ok: remainingLegacyProducts.length === 0,
    remainingLegacyProducts,
  };
}

async function migrate(): Promise<MigrationLog> {
  requireEnv("MONGODB_URI");
  requireEnv("CLOUDINARY_CLOUD_NAME");
  requireEnv("CLOUDINARY_API_KEY");
  requireEnv("CLOUDINARY_API_SECRET");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  await connectDb(process.env.MONGODB_URI!);

  const log: MigrationLog = {
    startedAt: new Date().toISOString(),
    totals: {
      productsSeen: 0,
      productsUpdated: 0,
      imagesUploaded: 0,
      imagesSkipped: 0,
      imagesFailed: 0,
      remainingLegacyProducts: 0,
    },
    products: [],
    removableLocalFiles: [],
    verification: { ok: false, remainingLegacyProducts: [] },
  };

  const cursor = Product.find({}, { name: 1, images: 1, imageMeta: 1 }).cursor();

  for await (const product of cursor) {
    log.totals.productsSeen += 1;
    const productLog: ProductMigrationLog = {
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
        const result = await migrateOneImage(currentImages[index], index);
        nextImages.push(result.nextImage);
        productLog[result.entry.status].push(result.entry);
      }

      const changedImages = JSON.stringify(currentImages) !== JSON.stringify(nextImages);
      const clearImageMeta = hasLegacyImageMetaReference(product.get("imageMeta")) || changedImages;

      if (changedImages || clearImageMeta) {
        const update: Record<string, unknown> = { images: nextImages };
        if (clearImageMeta) update.imageMeta = [];
        await Product.updateOne({ _id: product._id }, { $set: update });
        log.totals.productsUpdated += 1;
      }
    } catch (error) {
      productLog.failed.push({
        index: -1,
        status: "failed",
        source: "product",
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    log.totals.imagesUploaded += productLog.uploaded.length;
    log.totals.imagesSkipped += productLog.skipped.length;
    log.totals.imagesFailed += productLog.failed.length;

    if (productLog.uploaded.length || productLog.skipped.length || productLog.failed.length) {
      log.products.push(productLog);
      console.log(
        `[product] ${productLog.productId} "${productLog.productName}" uploaded=${productLog.uploaded.length} skipped=${productLog.skipped.length} failed=${productLog.failed.length}`
      );
    }
  }

  log.verification = await verifyProducts();
  log.totals.remainingLegacyProducts = log.verification.remainingLegacyProducts.length;
  log.finishedAt = new Date().toISOString();
  log.removableLocalFiles = Array.from(removableLocalFiles).sort();

  const logDir = path.resolve(process.cwd(), "logs");
  await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `cloudinary-image-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(logPath, JSON.stringify(log, null, 2));

  console.log("\nCloudinary image migration complete.");
  console.log(`Products scanned: ${log.totals.productsSeen}`);
  console.log(`Products updated: ${log.totals.productsUpdated}`);
  console.log(`Images uploaded: ${log.totals.imagesUploaded}`);
  console.log(`Images skipped: ${log.totals.imagesSkipped}`);
  console.log(`Images failed: ${log.totals.imagesFailed}`);
  console.log(`Remaining products with legacy image references: ${log.totals.remainingLegacyProducts}`);
  console.log(`Write mode: ${writeMode()}`);
  console.log(`Public backend fallback: ${publicBaseUrl() ?? "not configured"}`);
  console.log(`Migration log: ${logPath}`);

  if (log.removableLocalFiles.length > 0) {
    console.log("\nLocal files that can be considered for manual removal after verification:");
    log.removableLocalFiles.forEach((filePath) => console.log(`- ${filePath}`));
  }

  if (!log.verification.ok) {
    console.log("\nProducts still containing legacy image references are listed in the migration log.");
  }

  return log;
}

migrate()
  .then(async (log) => {
    await disconnectDb();
    process.exit(log.verification.ok && log.totals.imagesFailed === 0 ? 0 : 1);
  })
  .catch(async (error) => {
    console.error("[cloudinary-migration] fatal:", error instanceof Error ? error.message : String(error));
    if (mongoose.connection.readyState !== 0) await disconnectDb();
    process.exit(1);
  });
