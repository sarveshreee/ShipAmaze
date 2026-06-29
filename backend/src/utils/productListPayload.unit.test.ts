import { describe, expect, it } from "vitest";
import { PRODUCT_LIST_PROJECT, buildProductListPipeline, pickPrimaryImageUrl } from "./productListPayload.js";

function containsKey(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value).some((child) => containsKey(child, key));
}

describe("product list payload", () => {
  it("uses a projection that is safe for Cloudinary image objects", () => {
    expect(containsKey(PRODUCT_LIST_PROJECT.images, "$toString")).toBe(false);
    expect(containsKey(PRODUCT_LIST_PROJECT.images, "onError")).toBe(true);
    expect(containsKey(PRODUCT_LIST_PROJECT.images, "$isArray")).toBe(true);
    expect(containsKey(PRODUCT_LIST_PROJECT.hasImage, "$isArray")).toBe(true);
  });

  it("builds list pipelines with the safe image projection", () => {
    const pipeline = buildProductListPipeline({ status: "active" });
    const projectStage = pipeline.at(-1);

    expect(projectStage).toEqual({ $project: expect.objectContaining({ images: PRODUCT_LIST_PROJECT.images }) });
  });

  it("resolves object-based primary image URLs for mapped rows", () => {
    expect(
      pickPrimaryImageUrl({
        images: [
          {
            publicId: "shipamaze/products/example",
            secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/shipamaze/products/example.webp",
          },
        ],
      })
    ).toBe("https://res.cloudinary.com/demo/image/upload/v1/shipamaze/products/example.webp");
  });
});
