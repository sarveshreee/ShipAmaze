/**
 * One-time migration: optimize legacy product images (base64 / remote URLs) to WebP on disk.
 * Usage: npx tsx src/scripts/migrateProductImages.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { ensureProductImagesOptimized } from "../services/productImageService.js";

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(uri);
  const products = await Product.find({ images: { $exists: true, $ne: [] } })
    .select("_id images imageMeta")
    .lean();

  let migrated = 0;
  for (const product of products) {
    const id = String(product._id);
    const images = Array.isArray(product.images) ? (product.images as string[]) : [];
    const imageMeta = Array.isArray((product as Record<string, unknown>).imageMeta)
      ? ((product as Record<string, unknown>).imageMeta as import("../services/productImageService.js").ProductImageMeta[])
      : undefined;

    const result = await ensureProductImagesOptimized(id, images, imageMeta);
    if (!result.changed) continue;

    await Product.updateOne(
      { _id: product._id },
      { $set: { images: result.images, imageMeta: result.imageMeta } }
    );
    migrated += 1;
    console.log(`[migrateProductImages] optimized ${id} (${result.images.length} images)`);
  }

  console.log(`[migrateProductImages] done — ${migrated}/${products.length} products updated`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("[migrateProductImages] failed:", error);
  process.exit(1);
});
