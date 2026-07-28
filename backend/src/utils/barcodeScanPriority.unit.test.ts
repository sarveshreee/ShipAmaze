import { describe, expect, it } from "vitest";
import { classifyBarcodeValue, preferBarcodeValue, scanLookupClauses } from "./barcodeScanPriority.js";

describe("barcodeScanPriority", () => {
  it("classifies AWB-like values", () => {
    expect(classifyBarcodeValue("ACCT-000040")).toBe("awb");
  });

  it("classifies order-id hints", () => {
    expect(classifyBarcodeValue("SA-12345")).toBe("orderId");
    expect(classifyBarcodeValue("ORD_9988")).toBe("orderId");
  });

  it("prefers AWB over order id and tracking", () => {
    expect(
      preferBarcodeValue([
        { value: "SA-1001", kind: "orderId" },
        { value: "TRK999888", kind: "tracking" },
        { value: "ACCT-000040", kind: "awb" },
      ])
    ).toBe("ACCT-000040");
  });

  it("prefers tracking over order id when no AWB", () => {
    expect(
      preferBarcodeValue([
        { value: "SA-1001", kind: "orderId" },
        { value: "TRK99988877", kind: "tracking" },
      ])
    ).toBe("TRK99988877");
  });

  it("builds AWB-first lookup clauses", () => {
    const clauses = scanLookupClauses("AWB123");
    expect(Object.keys(clauses[0] as object)[0]).toBe("awb");
    expect(clauses.some((c) => "orderId" in c)).toBe(true);
  });
});
