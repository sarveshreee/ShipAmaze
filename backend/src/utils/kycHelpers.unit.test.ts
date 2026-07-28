import { describe, it, expect } from "vitest";
import {
  assertValidKycDocumentPayload,
  buildKycLegacyData,
  mergeKycDocumentsForSubmit,
  resolveKycDocuments,
  settingsLinkForRole,
  stripKycDocFieldsFromBody,
} from "./kycHelpers.js";

describe("resolveKycDocuments", () => {
  it("preserves existing when body has no docs field", () => {
    const existing = { pan: "data:image/png;base64,aaa", gst: "data:image/png;base64,bbb" };
    expect(resolveKycDocuments(false, existing, {})).toEqual(existing);
  });

  it("replaces with client-provided docs and drops removed keys", () => {
    const existing = { pan: "old-pan", gst: "old-gst", cin: "old-cin" };
    const incoming = { pan: "new-pan", gst: "new-gst" };
    expect(resolveKycDocuments(true, existing, incoming)).toEqual({
      pan: "new-pan",
      gst: "new-gst",
    });
  });

  it("ignores blank strings", () => {
    expect(resolveKycDocuments(true, { pan: "x" }, { pan: "  ", gst: "data:image/png;base64,y" })).toEqual({
      gst: "data:image/png;base64,y",
    });
  });
});

describe("mergeKycDocumentsForSubmit", () => {
  it("keeps existing docs and overlays new ones", () => {
    expect(
      mergeKycDocumentsForSubmit(
        { pan: "old-pan", aadhaarFront: "front", aadhaarBack: "back" },
        { pan: "new-pan" }
      )
    ).toEqual({ pan: "new-pan", aadhaarFront: "front", aadhaarBack: "back" });
  });
});

describe("buildKycLegacyData", () => {
  it("strips uploaded_docs and documents from persisted legacy blob", () => {
    const data = buildKycLegacyData(
      { status: "draft", uploaded_docs: { pan: "huge" } },
      { full_name: "Ada", uploaded_docs: { pan: "huger" }, documents: { gst: "x" }, status: "draft" }
    );
    expect(data.full_name).toBe("Ada");
    expect(data.status).toBe("draft");
    expect(data.uploaded_docs).toBeUndefined();
    expect(data.documents).toBeUndefined();
  });
});

describe("stripKycDocFieldsFromBody", () => {
  it("removes doc keys without mutating other fields", () => {
    const body = { a: 1, uploaded_docs: { pan: "x" }, documents: { gst: "y" } };
    const stripped = stripKycDocFieldsFromBody(body);
    expect(stripped).toEqual({ a: 1 });
    expect(body.uploaded_docs).toBeDefined();
  });
});

describe("assertValidKycDocumentPayload", () => {
  it("accepts image data URLs", () => {
    expect(
      assertValidKycDocumentPayload({ pan: "data:image/jpeg;base64,/9j/4AAQ" })
    ).toBeNull();
  });

  it("rejects oversized payloads", () => {
    const huge = `data:image/png;base64,${"a".repeat(7_600_000)}`;
    expect(assertValidKycDocumentPayload({ pan: huge })).toMatch(/too large/i);
  });

  it("rejects non-image payloads", () => {
    expect(assertValidKycDocumentPayload({ pan: "not-a-url" })).toMatch(/must be an image/i);
  });
});

describe("settingsLinkForRole", () => {
  it("routes vendors to vendor settings", () => {
    expect(settingsLinkForRole("vendor")).toBe("/vendor/settings");
    expect(settingsLinkForRole("dropshipper")).toBe("/dropshipper/settings");
  });
});
