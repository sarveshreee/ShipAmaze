import { describe, expect, it } from "vitest";
import { assertIntegrationTestMongoUri, extractMongoDatabaseName } from "./mongoIntegrationSetup.js";

describe("mongoIntegrationSetup", () => {
  it("extracts database name from standard URI", () => {
    expect(extractMongoDatabaseName("mongodb://127.0.0.1:27017/shipamaze_test")).toBe(
      "shipamaze_test"
    );
  });

  it("accepts test database URIs", () => {
    assertIntegrationTestMongoUri("mongodb://127.0.0.1:27017/shipamaze_test");
  });

  it("rejects URIs without test in database name", () => {
    expect(() =>
      assertIntegrationTestMongoUri("mongodb://127.0.0.1:27017/shipamaze")
    ).toThrow(/must contain "test"/);
  });

  it("rejects when identical to MONGODB_URI", () => {
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/shipamaze_prod_test";
    expect(() =>
      assertIntegrationTestMongoUri("mongodb://127.0.0.1:27017/shipamaze_prod_test")
    ).toThrow(/must not be identical/);
    delete process.env.MONGODB_URI;
  });
});
