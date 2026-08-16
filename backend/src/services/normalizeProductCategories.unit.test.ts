import { describe, expect, it } from "vitest";
import {
  applyNormalizedCategoriesToBody,
  normalizeProductCategories,
} from "./normalizeProductCategories.js";

describe("normalizeProductCategories", () => {
  it("syncs category from categories[0]", () => {
    const n = normalizeProductCategories({ categories: ["tested", "sale"] });
    expect(n.category).toBe("tested");
    expect(n.categories).toEqual(["tested", "sale"]);
  });

  it("syncs categories from single category (bulk move A→B)", () => {
    const n = normalizeProductCategories({ category: "tested" });
    expect(n.category).toBe("tested");
    expect(n.categories).toEqual(["tested"]);
  });

  it("moves primary when both provided and primary is in list", () => {
    const n = normalizeProductCategories({ category: "B", categories: ["A", "B", "C"] });
    expect(n.category).toBe("B");
    expect(n.categories).toEqual(["B", "A", "C"]);
  });

  it("clears category when empty", () => {
    const n = normalizeProductCategories({ category: "", categories: [] });
    expect(n.category).toBe("");
    expect(n.categories).toEqual([]);
  });

  it("dedupes names", () => {
    const n = normalizeProductCategories({ categories: ["tested", "tested", "sale"] });
    expect(n.categories).toEqual(["tested", "sale"]);
  });

  it("applyNormalizedCategoriesToBody writes both fields", () => {
    const body: Record<string, unknown> = { category: "old" };
    applyNormalizedCategoriesToBody(body, normalizeProductCategories({ category: "tested" }));
    expect(body.category).toBe("tested");
    expect(body.categories).toEqual(["tested"]);
  });
});
