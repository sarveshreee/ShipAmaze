/**
 * Central environment validation. Call once at process startup before DB connect.
 */

const isProd = process.env.NODE_ENV === "production";

function truthyFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function falsyFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
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

    if (isVelocityEnabledFlag()) {
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

/**
 * True feature flag for Velocity.
 * - Explicit false/0/no/off → disabled (kill switch)
 * - Explicit true/1/yes/on → enabled
 * - Unset/empty → enabled (backward compatible default; Velocity is the legacy provider)
 */
export function isVelocityEnabledFlag(): boolean {
  const raw = process.env.VELOCITY_ENABLED;
  if (raw === undefined || String(raw).trim() === "") return true;
  if (falsyFlag(raw)) return false;
  return truthyFlag(raw);
}

/**
 * Credentials present AND feature flag enabled.
 * Background sync / API booking must use this (or check both separately).
 */
export function isVelocityActive(): boolean {
  return isVelocityEnabledFlag() && isVelocityConfigured();
}

/**
 * Returns true when Velocity credentials are configured (ignores feature flag).
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
