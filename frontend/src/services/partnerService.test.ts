import { describe, expect, it } from "vitest";
import { ALL_PARTNER_SCOPES, PARTNER_SCOPE_LABELS } from "./partnerService";

describe("partnerService", () => {
  it("defines all partner scopes with labels", () => {
    expect(ALL_PARTNER_SCOPES.length).toBe(5);
    for (const scope of ALL_PARTNER_SCOPES) {
      expect(PARTNER_SCOPE_LABELS[scope]).toBeTruthy();
    }
  });
});
