/**
 * Central environment validation. Call once at process startup before DB connect.
 */

const isProd = process.env.NODE_ENV === "production";

function truthyVelocityEnabled(): boolean {
  const v = process.env.VELOCITY_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Redact user:password from a MongoDB URI for logs. */
export function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/([^/@]+)@/, "//***@");
}

export function validateEnv(): void {
  const missing: string[] = [];

  if (!process.env.MONGODB_URI?.trim()) missing.push("MONGODB_URI");

  if (isProd) {
    if (!process.env.JWT_SECRET?.trim()) missing.push("JWT_SECRET");
    if (!process.env.CORS_ORIGIN?.trim()) missing.push("CORS_ORIGIN");
    if (!process.env.ENCRYPTION_SECRET?.trim()) missing.push("ENCRYPTION_SECRET");

    const frontendUrl = process.env.FRONTEND_URL?.trim();
    const corsFirst = process.env.CORS_ORIGIN?.split(",")[0]?.trim();
    if (!frontendUrl && !corsFirst) {
      missing.push("FRONTEND_URL (or set CORS_ORIGIN to your frontend HTTPS origin)");
    }

    if (!process.env.SHOPIFY_REDIRECT_URI?.trim()) missing.push("SHOPIFY_REDIRECT_URI");

    if (truthyVelocityEnabled()) {
      for (const k of ["VELOCITY_USERNAME", "VELOCITY_PASSWORD"] as const) {
        if (!process.env[k]?.trim()) missing.push(k);
      }
    }
  }

  if (missing.length) {
    throw new Error(
      `[env] Missing required environment variable(s): ${missing.join(", ")}. See backend/.env.example and PRODUCTION_RELEASE_CHECKLIST.md.`
    );
  }
}

export function isProduction(): boolean {
  return isProd;
}

export function isVelocityEnabledFlag(): boolean {
  return truthyVelocityEnabled();
}
