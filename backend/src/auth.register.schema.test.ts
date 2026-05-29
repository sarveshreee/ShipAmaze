import { describe, it, expect } from "vitest";
import { z } from "zod";
import { PUBLIC_REGISTER_ROLES } from "./controllers/authController.js";

const publicRoleSchema = z.enum(PUBLIC_REGISTER_ROLES);

describe("public registration roles", () => {
  it("allows vendor and dropshipper only", () => {
    expect(publicRoleSchema.safeParse("vendor").success).toBe(true);
    expect(publicRoleSchema.safeParse("dropshipper").success).toBe(true);
    expect(publicRoleSchema.safeParse("admin").success).toBe(false);
  });
});
