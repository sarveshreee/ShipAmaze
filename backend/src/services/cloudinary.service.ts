import type { UploadApiOptions, UploadApiResponse } from "cloudinary";
import streamifier from "streamifier";
import { cloudinary } from "../config/cloudinary.js";
import { AppError } from "../middleware/errorMiddleware.js";

export interface CloudinaryProductImage {
  publicId: string;
  secureUrl: string;
}

export type ProductImageValue =
  | string
  | {
      publicId?: unknown;
      public_id?: unknown;
      secureUrl?: unknown;
      secure_url?: unknown;
      url?: unknown;
      path?: unknown;
    };

export const PRODUCT_IMAGE_FOLDER = "shipamaze/products";
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function cloudinaryImageFromUrl(url: string): CloudinaryProductImage | null {
  if (!/\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//i.test(url)) return null;
  const cleanUrl = url.split(/[?#]/)[0];
  const marker = "/image/upload/";
  const markerIndex = cleanUrl.indexOf(marker);
  if (markerIndex < 0) return null;

  const uploadPath = cleanUrl.slice(markerIndex + marker.length);
  const folderIndex = uploadPath.indexOf(`${PRODUCT_IMAGE_FOLDER}/`);
  const publicPath = folderIndex >= 0
    ? uploadPath.slice(folderIndex)
    : uploadPath.replace(/^(?:[^/]+\/)*v\d+\//, "");
  const publicId = decodeURIComponent(publicPath).replace(/\.[a-z0-9]+$/i, "");
  return publicId ? { publicId, secureUrl: url } : null;
}

function assertCloudinaryConfigured(): void {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new AppError(500, "Image upload is not configured");
  }
}

export function normalizeCloudinaryImage(value: ProductImageValue): CloudinaryProductImage | null {
  if (typeof value === "string") return cloudinaryImageFromUrl(value.trim());
  if (!value || typeof value !== "object") return null;
  const publicId = String(value.publicId ?? value.public_id ?? "").trim();
  const secureUrl = String(value.secureUrl ?? value.secure_url ?? "").trim();
  if (!publicId || !secureUrl) return null;
  return { publicId, secureUrl };
}

export function productImageUrl(value: ProductImageValue | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  const cloudinaryImage = normalizeCloudinaryImage(value);
  if (cloudinaryImage) return cloudinaryImage.secureUrl;
  const fallback = String(value.url ?? value.path ?? "").trim();
  return fallback || null;
}

export function productImagePublicId(value: ProductImageValue | null | undefined): string | null {
  if (!value) return null;
  return normalizeCloudinaryImage(value)?.publicId ?? null;
}

export function isCloudinaryImage(value: ProductImageValue | null | undefined): boolean {
  if (!value) return false;
  return Boolean(normalizeCloudinaryImage(value));
}

function parseDataUrl(input: string): { mimeType: string; buffer: Buffer } {
  const match = input.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new AppError(400, "Invalid image data");
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AppError(400, "Only JPG, PNG and WEBP images are allowed");
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.length > PRODUCT_IMAGE_MAX_BYTES) {
    throw new AppError(400, "Image size must be 5 MB or less");
  }
  if (buffer.length === 0) throw new AppError(400, "Invalid image data");
  return { mimeType, buffer };
}

export function validateImageFileName(name: string): void {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(400, "Only JPG, PNG and WEBP images are allowed");
  }
}

export function validateImageMimeAndSize(mimeType: string, size: number, fileName?: string): void {
  if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    throw new AppError(400, "Only JPG, PNG and WEBP images are allowed");
  }
  if (fileName) validateImageFileName(fileName);
  if (size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new AppError(400, "Image size must be 5 MB or less");
  }
}

function uploadOptions(): UploadApiOptions {
  return {
    folder: PRODUCT_IMAGE_FOLDER,
    resource_type: "image",
    overwrite: true,
    unique_filename: true,
  };
}

function mapUploadResult(result: UploadApiResponse): CloudinaryProductImage {
  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
  };
}

export async function uploadImageBuffer(buffer: Buffer): Promise<CloudinaryProductImage> {
  assertCloudinaryConfigured();
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(uploadOptions(), (error, result) => {
      if (error || !result) {
        reject(error ?? new Error("Cloudinary upload failed"));
        return;
      }
      resolve(mapUploadResult(result));
    });
    streamifier.createReadStream(buffer).pipe(upload);
  });
}

export async function uploadDataUrlImage(dataUrl: string): Promise<CloudinaryProductImage> {
  const { buffer } = parseDataUrl(dataUrl);
  return uploadImageBuffer(buffer);
}

export async function uploadRemoteImage(url: string): Promise<CloudinaryProductImage> {
  assertCloudinaryConfigured();
  validateImageFileName(new URL(url).pathname);
  const result = await cloudinary.uploader.upload(url, uploadOptions());
  return mapUploadResult(result);
}

export async function deleteCloudinaryImage(publicId: string): Promise<void> {
  if (!publicId.trim()) return;
  assertCloudinaryConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
}

export async function deleteCloudinaryImages(values: Array<ProductImageValue | null | undefined>): Promise<void> {
  const publicIds = Array.from(
    new Set(values.map((value) => productImagePublicId(value)).filter((value): value is string => Boolean(value)))
  );
  await Promise.all(
    publicIds.map((publicId) =>
      deleteCloudinaryImage(publicId).catch((error) => {
        console.warn("[cloudinary] delete failed:", error instanceof Error ? error.message : String(error));
      })
    )
  );
}

export function buildCloudinaryImageUrl(
  image: ProductImageValue,
  options: { width: number; crop?: "fill" | "limit" }
): string | null {
  const cloudinaryImage = normalizeCloudinaryImage(image);
  if (!cloudinaryImage) return productImageUrl(image);
  return cloudinary.url(cloudinaryImage.publicId, {
    secure: true,
    resource_type: "image",
    transformation: [
      {
        width: options.width,
        crop: options.crop,
        quality: "auto",
        fetch_format: "auto",
      },
    ],
  });
}
