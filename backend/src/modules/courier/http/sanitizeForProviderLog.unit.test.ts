import { describe, it, expect } from "vitest";
import { sanitizeForProviderLog } from "./sanitizeForProviderLog.js";

describe("sanitizeForProviderLog", () => {
  it("masks phone, email, and secrets", () => {
    const sanitized = sanitizeForProviderLog({
      phone: "9876543210",
      email: "seller@example.com",
      password: "secret",
      token: "abc",
      Authorization: "Bearer xyz",
      nested: { api_key: "k", city: "Delhi" },
    }) as Record<string, unknown>;

    expect(String(sanitized.phone)).toContain("3210");
    expect(String(sanitized.phone)).not.toContain("987654");
    expect(String(sanitized.email)).toContain("@example.com");
    expect(sanitized.password).toBe("***MASKED***");
    expect(sanitized.token).toBe("***MASKED***");
    expect(sanitized.Authorization).toBe("***MASKED***");
    expect((sanitized.nested as Record<string, unknown>).api_key).toBe("***MASKED***");
    expect((sanitized.nested as Record<string, unknown>).city).toBe("Delhi");
  });
});
