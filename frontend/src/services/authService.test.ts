import { describe, it, expect } from "vitest";
import { roleAddOrderPath, roleDashboardPath, roleHomePath } from "./authService";

describe("roleDashboardPath", () => {
  it("returns role-specific dashboard paths", () => {
    expect(roleDashboardPath("admin")).toBe("/admin/dashboard");
    expect(roleDashboardPath("vendor")).toBe("/vendor/dashboard");
    expect(roleDashboardPath("dropshipper")).toBe("/dropshipper/dashboard");
  });
});

describe("roleHomePath", () => {
  it("returns marketplace home paths aligned with sidebar", () => {
    expect(roleHomePath("dropshipper")).toBe("/dropshipper/home");
    expect(roleHomePath("vendor")).toBe("/vendor/home");
    expect(roleHomePath("admin")).toBe("/admin/home");
  });
});

describe("roleAddOrderPath", () => {
  it("returns add-order path per role prefix", () => {
    expect(roleAddOrderPath("dropshipper")).toBe("/dropshipper/add-order");
  });
});
