/**
 * Central environment validation. Call once at process startup before DB connect.
 */

const isProd = process.env.NODE_ENV === "production";

function truthyFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function truthyVelocityEnabled(): boolean {
  return truthyFlag(process.env.VELOCITY_ENABLED);
}

function truthyLorrigoEnabled(): boolean {
  return truthyFlag(process.env.LORRIGO_ENABLED);
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
    if (!process.env.ENCRYPTION_SECRET?.trim()) missing.push("ENCRYPTION_SECRET");

    const frontendUrl = process.env.FRONTEND_URL?.trim();
    const corsFirst = process.env.CORS_ORIGIN?.split(",")[0]?.trim();
    if (!frontendUrl && !corsFirst) {
      missing.push("CORS_ORIGIN or FRONTEND_URL");
    }

    if (!process.env.SHOPIFY_REDIRECT_URI?.trim()) missing.push("SHOPIFY_REDIRECT_URI");

    if (truthyVelocityEnabled()) {
      for (const k of ["VELOCITY_USERNAME", "VELOCITY_PASSWORD"] as const) {
        if (!process.env[k]?.trim()) missing.push(k);
      }
    }

    if (truthyLorrigoEnabled()) {
      for (const k of ["LORRIGO_EMAIL", "LORRIGO_PASSWORD"] as const) {
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

/**
 * Returns true when Velocity credentials are configured, regardless of the VELOCITY_ENABLED flag.
 * Used to gate background sync — if credentials exist, we can sync even in dev/staging.
 */
export function isVelocityConfigured(): boolean {
  return !!(process.env.VELOCITY_USERNAME?.trim() && process.env.VELOCITY_PASSWORD?.trim());
}

export function isLorrigoEnabledFlag(): boolean {
  return truthyLorrigoEnabled();
}

export function isLorrigoConfigured(): boolean {
  return !!(process.env.LORRIGO_EMAIL?.trim() && process.env.LORRIGO_PASSWORD?.trim());
}
