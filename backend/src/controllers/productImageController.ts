import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Product } from "../models/Product.js";
import {
  readOptimizedImageFile,
  type ImageWidth,
} from "../services/productImageService.js";
import { buildCloudinaryImageUrl, productImageUrl, type ProductImageValue } from "../services/cloudinary.service.js";

function parseSizeParam(sizeParam: string): ImageWidth | "thumb" {
  if (sizeParam === "thumb.webp" || sizeParam === "thumb") return "thumb";
  const numeric = Number(String(sizeParam).replace(/\.webp$/i, ""));
  if (numeric === 300 || numeric === 600 || numeric === 800) return numeric;
  return 800;
}

function sendImageBuffer(res: Response, buffer: Buffer, mimeType: string, cacheSeconds: number): void {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", `public, max-age=${cacheSeconds}${cacheSeconds >= 86400 ? ", immutable" : ""}`);
  // The Vite frontend runs on a different origin in dev (localhost:8080 vs 5000).
  // Helmet's default CORP=same-origin blocks otherwise valid <img> responses.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.send(buffer);
}

/** Public product image route — img tags cannot send auth headers. */
export async function serveProductImageAsset(req: Request, res: Response): Promise<void> {
  const { productId, index, size } = req.params;
  const idx = Number(index ?? 0);
  if (!productId || !Types.ObjectId.isValid(productId) || !Number.isFinite(idx) || idx < 0) {
    res.status(400).send("Bad request");
    return;
  }

  const sizeKey = parseSizeParam(String(size ?? "800.webp"));
  const diskBuffer = await readOptimizedImageFile(productId, idx, sizeKey);
  if (diskBuffer) {
    sendImageBuffer(res, diskBuffer, "image/webp", 31536000);
    return;
  }

  const product = await Product.findById(productId).select("images").lean();
  if (!product) {
    res.status(404).send("Not found");
    return;
  }

  const images = Array.isArray(product.images) ? (product.images as ProductImageValue[]) : [];
  const image = images[idx];
  if (image) {
    const width = sizeKey === "thumb" ? 250 : sizeKey;
    const transformed = buildCloudinaryImageUrl(image, {
      width,
      crop: sizeKey === "thumb" ? "fill" : undefined,
    });
    const original = productImageUrl(image);
    if (transformed && transformed !== original) {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.redirect(302, transformed);
      return;
    }
  }
  const src = productImageUrl(image);
  if (!src) {
    res.status(404).send("Image not found");
    return;
  }

  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      res.status(400).send("Invalid data URL");
      return;
    }
    sendImageBuffer(res, Buffer.from(match[2], "base64"), match[1], 86400);
    return;
  }

  if (/^https?:\/\//i.test(src)) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.redirect(302, src);
    return;
  }

  res.status(404).send("Image not found");
}
