import { describe, expect, it } from "vitest";
import { parseShopifyScopeList, validateGrantedShopifyScopes } from "./shopifyScopes.js";

describe("parseShopifyScopeList", () => {
  it("parses comma-separated scopes", () => {
    expect(parseShopifyScopeList("read_orders,write_orders,read_products")).toEqual(
      new Set(["read_orders", "write_orders", "read_products"])
    );
  });

  it("parses space-separated scopes", () => {
    expect(
      parseShopifyScopeList(
        "read_orders write_orders read_products write_products read_locations write_locations read_customers write_customers"
      )
    ).toEqual(
      new Set([
        "read_orders",
        "write_orders",
        "read_products",
        "write_products",
        "read_locations",
        "write_locations",
        "read_customers",
        "write_customers",
      ])
    );
  });

  it("parses scope arrays", () => {
    expect(parseShopifyScopeList(["read_orders", "write_orders"])).toEqual(
      new Set(["read_orders", "write_orders"])
    );
  });
});

describe("validateGrantedShopifyScopes", () => {
  it("accepts when all default scopes are granted", () => {
    process.env.SHOPIFY_SCOPES =
      "read_customers,write_customers,read_fulfillments,write_fulfillments,write_locations,read_locations," +
      "read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders," +
      "read_third_party_fulfillment_orders,write_third_party_fulfillment_orders," +
      "read_assigned_fulfillment_orders,write_assigned_fulfillment_orders," +
      "read_orders,write_orders,read_products,write_products";
    const granted = parseShopifyScopeList(process.env.SHOPIFY_SCOPES);
    expect(validateGrantedShopifyScopes(granted)).toBeNull();
  });
});
