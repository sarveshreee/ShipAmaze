import { describe, it, expect } from "vitest";
import { roleDashboardPath } from "./authService";

describe("roleDashboardPath", () => {
  it("returns role-specific dashboard paths", () => {
    expect(roleDashboardPath("admin")).toBe("/admin/dashboard");
    expect(roleDashboardPath("vendor")).toBe("/vendor/dashboard");
    expect(roleDashboardPath("dropshipper")).toBe("/dropshipper/dashboard");
  });
});
