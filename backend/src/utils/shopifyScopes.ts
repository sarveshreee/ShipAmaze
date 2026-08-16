/** Admin API scopes requested during OAuth and shown in the Channels setup guide. */
export const DEFAULT_SHOPIFY_OAUTH_SCOPES = [
  "read_customers",
  "write_customers",
  "read_fulfillments",
  "write_fulfillments",
  "write_locations",
  "read_locations",
  "read_merchant_managed_fulfillment_orders",
  "write_merchant_managed_fulfillment_orders",
  "read_third_party_fulfillment_orders",
  "write_third_party_fulfillment_orders",
  "read_assigned_fulfillment_orders",
  "write_assigned_fulfillment_orders",
  "read_orders",
  "write_orders",
  "read_products",
  "write_products",
] as const;

/** Minimum scopes required to mark Shopify orders Fulfilled after AWB booking. */
export const SHOPIFY_FULFILLMENT_WRITE_SCOPES = [
  "write_fulfillments",
  "write_merchant_managed_fulfillment_orders",
] as const;

export function shopifyOAuthScopesString(): string {
  const env = process.env.SHOPIFY_SCOPES?.trim();
  if (env) return env;
  return DEFAULT_SHOPIFY_OAUTH_SCOPES.join(",");
}

export function getRequestedShopifyScopes(): string[] {
  return [...parseShopifyScopeList(shopifyOAuthScopesString())];
}

/** Shopify may return scopes comma- or space-separated; token `scope` can also be empty. */
export function parseShopifyScopeList(scope: unknown): Set<string> {
  if (Array.isArray(scope)) {
    return new Set(scope.map((s) => String(s).trim()).filter(Boolean));
  }
  if (typeof scope !== "string" || !scope.trim()) {
    return new Set();
  }
  return new Set(
    scope
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function missingShopifyScopes(granted: Set<string>, required: readonly string[]): string[] {
  return required.filter((s) => !granted.has(s));
}

export function formatMissingShopifyScopesError(missing: string[]): string {
  return (
    `Missing Shopify scopes: ${missing.join(", ")}. ` +
    "In Shopify Admin → Develop apps → your custom app → Configuration, enable each scope under Admin API access scopes " +
    "(select every scope individually — do not paste the comma-separated list as a single entry), save, then connect again."
  );
}

export function validateGrantedShopifyScopes(granted: Set<string>): string | null {
  const missing = missingShopifyScopes(granted, getRequestedShopifyScopes());
  if (missing.length === 0) return null;
  return formatMissingShopifyScopesError(missing);
}
