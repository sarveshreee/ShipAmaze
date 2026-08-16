import { describe, expect, it } from "vitest";
import { applyDefaultTestEnv } from "../../test/testEnv.js";

applyDefaultTestEnv();

import {
  extractKeyPrefix,
  generateRawPartnerApiKey,
  hashPartnerApiKey,
  isPartnerKeyFormat,
  resolvePartnerApiKeyScopes,
  verifyPartnerApiKey,
} from "./partnerApiKeyService.js";
import { AppError } from "../../middleware/errorMiddleware.js";

describe("partnerApiKeyService", () => {
  it("generates sk_live_ prefixed keys", () => {
    const raw = generateRawPartnerApiKey();
    expect(raw.startsWith("sk_live_")).toBe(true);
    expect(isPartnerKeyFormat(raw)).toBe(true);
  });

  it("hashes and verifies secrets with timing-safe compare", () => {
    const raw = generateRawPartnerApiKey();
    const hash = hashPartnerApiKey(raw);
    expect(hash).not.toEqual(raw);
    expect(verifyPartnerApiKey(raw, hash)).toBe(true);
    expect(verifyPartnerApiKey(raw + "x", hash)).toBe(false);
  });

  it("extracts stable key prefix for lookup", () => {
    const raw = generateRawPartnerApiKey();
    const prefix = extractKeyPrefix(raw);
    expect(prefix.length).toBe(16);
    expect(raw.startsWith(prefix)).toBe(true);
  });

  it("rejects invalid key formats", () => {
    expect(isPartnerKeyFormat("jwt-token")).toBe(false);
    expect(isPartnerKeyFormat("sk_live_short")).toBe(false);
  });

  it("omitted scopes => all scopes", () => {
    const scopes = resolvePartnerApiKeyScopes(undefined);
    expect(scopes.length).toBe(5);
    expect(scopes).toContain("shipments:create");
  });

  it("valid scopes => normalized scopes", () => {
    const scopes = resolvePartnerApiKeyScopes(["shipments:create", "rates:read"]);
    expect(scopes).toEqual(["shipments:create", "rates:read"]);
  });

  it("mixture valid + invalid => valid scopes retained", () => {
    const scopes = resolvePartnerApiKeyScopes(["shipments:create", "invalid-scope"]);
    expect(scopes).toEqual(["shipments:create"]);
  });

  it("only invalid scopes => 400", () => {
    expect(() => resolvePartnerApiKeyScopes(["bad-scope"])).toThrow(AppError);
  });

  it("explicit empty array => 400", () => {
    expect(() => resolvePartnerApiKeyScopes([])).toThrow(AppError);
  });
});
