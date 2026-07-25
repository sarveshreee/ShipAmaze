/**
 * Default env for automated tests (no real secrets). Import at the top of test files
 * before importing `createApp` or models.
 */
export function applyDefaultTestEnv(): void {
  process.env.NODE_ENV ??= "test";
  process.env.JWT_SECRET ??= "test-jwt-secret-shipamaze-tests-only-32chars";
  process.env.ENCRYPTION_SECRET ??= "test-encryption-secret-32chars-min!!";
  process.env.CORS_ORIGIN ??= "http://localhost:8080";
  process.env.FRONTEND_URL ??= "http://localhost:8080";
  process.env.SHOPIFY_API_KEY ??= "test-shopify-api-key";
  process.env.SHOPIFY_API_SECRET ??= "test-shopify-api-secret";
  process.env.SHOPIFY_REDIRECT_URI ??= "http://localhost:5000/api/shopify/callback";
  process.env.SHOPIFY_WEBHOOK_URL ??= "http://localhost:5000/api/shopify/webhooks";
  process.env.SHOPIFY_SCOPES ??= "read_orders";
  process.env.VELOCITY_ENABLED ??= "false";
  process.env.LORRIGO_ENABLED ??= "false";
}
