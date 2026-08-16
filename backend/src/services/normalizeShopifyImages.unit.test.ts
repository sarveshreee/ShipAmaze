import { describe, expect, it } from "vitest";
import {
  mergeLineItemsPreservingImages,
  productPrimaryImageUrl,
  registerProductImages,
  resolveLineItemImageUrl,
} from "./normalizeShopifyImages.js";

describe("normalizeShopifyImages", () => {
  it("extracts primary image from product.image.src", () => {
    expect(
      productPrimaryImageUrl({
        id: 1,
        image: { src: "https://cdn.shopify.com/a.jpg" },
      })
    ).toBe("https://cdn.shopify.com/a.jpg");
  });

  it("falls back to images[] and protocol-relative CDN", () => {
    expect(
      productPrimaryImageUrl({
        id: 2,
        images: [{ src: "//cdn.shopify.com/b.jpg" }],
      })
    ).toBe("https://cdn.shopify.com/b.jpg");
  });

  it("maps variant-specific images", () => {
    const map = new Map<string, string>();
    registerProductImages(
      {
        id: 10,
        image: { src: "https://cdn.shopify.com/primary.jpg" },
        images: [
          { id: 100, src: "https://cdn.shopify.com/primary.jpg" },
          { id: 101, src: "https://cdn.shopify.com/variant.jpg" },
        ],
        variants: [
          { id: 501, image_id: 101 },
          { id: 502, image_id: null },
        ],
      },
      map
    );
    expect(map.get("variant:501")).toBe("https://cdn.shopify.com/variant.jpg");
    expect(map.get("variant:502")).toBe("https://cdn.shopify.com/primary.jpg");
    expect(map.get("10")).toBe("https://cdn.shopify.com/primary.jpg");
  });

  it("resolves line item from variant map then product map", () => {
    const map = new Map([
      ["variant:9", "https://cdn.shopify.com/v.jpg"],
      ["product:8", "https://cdn.shopify.com/p.jpg"],
    ]);
    expect(resolveLineItemImageUrl({ product_id: 8, variant_id: 9 }, map)).toBe(
      "https://cdn.shopify.com/v.jpg"
    );
    expect(resolveLineItemImageUrl({ product_id: 8 }, map)).toBe("https://cdn.shopify.com/p.jpg");
  });

  it("preserves existing imageUrl when incoming sync has none", () => {
    const merged = mergeLineItemsPreservingImages(
      [{ name: "A", sku: "S1", imageUrl: undefined }],
      [{ name: "A", sku: "S1", imageUrl: "https://cdn.shopify.com/keep.jpg" }]
    );
    expect(merged[0]?.imageUrl).toBe("https://cdn.shopify.com/keep.jpg");
  });

  it("does not overwrite a fresh imageUrl", () => {
    const merged = mergeLineItemsPreservingImages(
      [{ name: "A", sku: "S1", imageUrl: "https://cdn.shopify.com/new.jpg" }],
      [{ name: "A", sku: "S1", imageUrl: "https://cdn.shopify.com/old.jpg" }]
    );
    expect(merged[0]?.imageUrl).toBe("https://cdn.shopify.com/new.jpg");
  });

  it("handles products with no images", () => {
    expect(productPrimaryImageUrl({ id: 3, images: [] })).toBeUndefined();
    expect(resolveLineItemImageUrl({ product_id: 3 }, new Map())).toBeUndefined();
  });
});
