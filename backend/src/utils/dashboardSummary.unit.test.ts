import { describe, it, expect } from "vitest";
import {
  buildDashboardMatch,
  countStatuses,
  istTodayYmd,
  pct,
} from "./dashboardSummary.js";

describe("dashboardSummary helpers", () => {
  it("builds non-junk match for empty visibility", () => {
    expect(buildDashboardMatch({})).toEqual({ isJunk: { $ne: true } });
  });

  it("AND-merges visibility with non-junk", () => {
    expect(buildDashboardMatch({ vendorId: "abc" })).toEqual({
      $and: [{ vendorId: "abc" }, { isJunk: { $ne: true } }],
    });
  });

  it("computes percentages to 1 decimal", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(0, 0)).toBe(0);
  });

  it("counts statuses case-insensitively", () => {
    expect(
      countStatuses(
        [
          { name: "delivered", value: 5 },
          { name: "In Transit", value: 2 },
          { name: "in_transit", value: 1 },
        ],
        ["delivered", "in_transit", "in-transit"]
      )
    ).toBe(8);
  });

  it("returns IST calendar day as YYYY-MM-DD", () => {
    expect(istTodayYmd(new Date("2026-07-28T18:30:00.000Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
