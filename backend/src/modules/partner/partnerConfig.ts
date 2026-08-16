export function isPartnerApiEnabled(): boolean {
  const v = String(process.env.PARTNER_API_ENABLED ?? "true").trim().toLowerCase();
  return v !== "false" && v !== "0";
}

/** When true, Partner Lorrigo/Ekart bookings precheck and debit linked dropshipper wallet. */
export function isPartnerWalletBillingEnabled(): boolean {
  const v = String(process.env.PARTNER_WALLET_BILLING_ENABLED ?? "false").trim().toLowerCase();
  return v === "true" || v === "1";
}

export function partnerApiBasePath(): string {
  return String(process.env.PARTNER_API_BASE_PATH ?? "/api/partner/v1").trim() || "/api/partner/v1";
}

export function partnerGeneralRateLimitMax(): number {
  return Number(process.env.PARTNER_GENERAL_RATE_LIMIT_MAX ?? 120);
}

export function partnerGeneralRateLimitWindowMs(): number {
  return Number(process.env.PARTNER_GENERAL_RATE_LIMIT_WINDOW_MS ?? 60_000);
}

export function partnerBookingRateLimitMax(): number {
  return Number(process.env.PARTNER_BOOKING_RATE_LIMIT_MAX ?? 10);
}

export function partnerBookingRateLimitWindowMs(): number {
  return Number(process.env.PARTNER_BOOKING_RATE_LIMIT_WINDOW_MS ?? 60_000);
}

export function partnerAuthFailureRateLimitMax(): number {
  return Number(process.env.PARTNER_AUTH_FAILURE_RATE_LIMIT_MAX ?? 30);
}

export function partnerAuthFailureRateLimitWindowMs(): number {
  return Number(process.env.PARTNER_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS ?? 60_000);
}

export type PartnerRateLimitStoreMode = "mongo" | "memory" | "shared-memory";

/**
 * mongo — production default; counters in MongoDB (multi-instance safe).
 * memory — process-local (dev/single-instance tests only).
 * shared-memory — test helper simulating distributed counters without Mongo.
 */
export function partnerRateLimitStoreMode(): PartnerRateLimitStoreMode {
  const explicit = String(process.env.PARTNER_RATE_LIMIT_STORE ?? "").trim().toLowerCase();
  if (explicit === "memory") return "memory";
  if (explicit === "shared-memory") return "shared-memory";
  if (explicit === "mongo") return "mongo";
  if (process.env.NODE_ENV === "test") return "memory";
  return "mongo";
}

export function partnerRateLimitPassOnStoreError(): boolean {
  const v = String(process.env.PARTNER_RATE_LIMIT_PASS_ON_STORE_ERROR ?? "true").trim().toLowerCase();
  return v !== "false" && v !== "0";
}

/**
 * Production startup checks for Partner API misconfiguration.
 * Does not throw — logs warnings/errors so operators can fix env without blocking unrelated routes.
 */
export function warnPartnerProductionMisconfiguration(): void {
  if (process.env.NODE_ENV === "test") return;

  const apiEnabled = isPartnerApiEnabled();
  const storeMode = partnerRateLimitStoreMode();

  if (process.env.NODE_ENV === "production") {
    if (storeMode === "memory") {
      console.error(
        "[partner-api] UNSAFE: PARTNER_RATE_LIMIT_STORE=memory in production — rate limits are process-local only. Set PARTNER_RATE_LIMIT_STORE=mongo."
      );
    }
    if (explicitPartnerRateLimitStore() === "memory") {
      console.error(
        "[partner-api] UNSAFE: PARTNER_RATE_LIMIT_STORE is explicitly set to memory in production."
      );
    }
  } else if (storeMode === "memory" && explicitPartnerRateLimitStore() === "memory") {
    console.warn(
      "[partner-api] PARTNER_RATE_LIMIT_STORE=memory — not safe for multi-instance production."
    );
  }

  if (apiEnabled && !isPartnerWalletBillingEnabled()) {
    console.warn(
      "[partner-api] PARTNER_API_ENABLED=true but PARTNER_WALLET_BILLING_ENABLED=false — Lorrigo/Ekart partner bookings will not precheck/debit the linked dropshipper wallet. Set PARTNER_WALLET_BILLING_ENABLED=true in production when billing applies."
    );
  }

  if (apiEnabled && process.env.NODE_ENV === "production" && storeMode === "mongo") {
    console.info("[partner-api] Distributed Mongo rate limiting enabled (PARTNER_RATE_LIMIT_STORE=mongo).");
  }
}

function explicitPartnerRateLimitStore(): string {
  return String(process.env.PARTNER_RATE_LIMIT_STORE ?? "").trim().toLowerCase();
}

/** Pepper for API key HMAC — uses existing server secret, not per-partner secrets in env. */
export function partnerApiKeyPepper(): string {
  const enc = String(process.env.ENCRYPTION_SECRET ?? "").trim();
  const jwt = String(process.env.JWT_SECRET ?? "").trim();
  const pepper = enc || jwt;
  if (!pepper) {
    throw new Error("ENCRYPTION_SECRET or JWT_SECRET required for partner API key hashing");
  }
  return pepper;
}

export const PARTNER_KEY_PREFIX_LIVE = "sk_live_";
export const PARTNER_KEY_PREFIX_LENGTH = 16;
