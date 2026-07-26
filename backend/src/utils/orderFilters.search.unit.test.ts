import { describe, it, expect } from "vitest";
import { buildSearchQuery, parseOrderListQuery, buildOrderListFiltersQuery } from "./orderFilters.js";

describe("buildSearchQuery", () => {
  it("builds $or across order fields without throwing", () => {
    const q = buildSearchQuery("test+order[1]");
    const or = (q as { $or: unknown[] }).$or;
    expect(Array.isArray(or)).toBe(true);
    expect(or.length).toBeGreaterThan(5);
  });

  it("includes ObjectId match for 24-hex strings", () => {
    const hex = "507f1f77bcf86cd799439011";
    const q = buildSearchQuery(hex);
    const or = (q as { $or: unknown[] }).$or;
    const idClause = or.find((c) => typeof c === "object" && c !== null && "_id" in (c as object));
    expect(idClause).toBeDefined();
  });
});

describe("parseOrderListQuery date aliases", () => {
  it("accepts fromDate and toDate as dateFrom/dateTo", async () => {
    const pq = parseOrderListQuery({
      page: "1",
      fromDate: "2025-01-01",
      toDate: "2025-01-31",
    });
    expect(pq.dateFrom).toBeInstanceOf(Date);
    expect(pq.dateTo).toBeInstanceOf(Date);
    const fq = await buildOrderListFiltersQuery(pq);
    expect(fq).toBeDefined();
    expect(fq).toEqual(
      expect.objectContaining({
        createdAt: expect.objectContaining({
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        }),
      })
    );
    const end = (fq as { createdAt: { $lte: Date } }).createdAt.$lte;
    const start = (fq as { createdAt: { $gte: Date } }).createdAt.$gte;
    // Full IST day span should be just under 24h
    expect(end.getTime() - start.getTime()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });
});
