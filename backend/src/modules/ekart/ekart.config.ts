/**
 * Ekart (Durin) provider configuration.
 * Feature flag mirrors Lorrigo: EKART_ENABLED must be explicitly true.
 */

function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function truthy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Feature flag — when false, Ekart is not registered or invoked. */
export function isEkartEnabledFlag(): boolean {
  return truthy(process.env.EKART_ENABLED);
}

/** Credentials present (independent of feature flag). */
export function isEkartConfigured(): boolean {
  const auth = process.env.EKART_AUTHORIZATION?.trim() || "";
  const merchant = process.env.EKART_MERCHANT_CODE?.trim() || "";
  return Boolean(auth && merchant);
}

function normalizeAuthorization(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^basic\s+/i.test(v)) return v;
  return `Basic ${v}`;
}

export const ekartConfig = {
  get enabled() {
    return isEkartEnabledFlag();
  },
  baseUrl: (process.env.EKART_BASE_URL || "https://api.ekartlogistics.com").replace(/\/$/, ""),
  get authorization() {
    return normalizeAuthorization(process.env.EKART_AUTHORIZATION || "");
  },
  get merchantCode() {
    return (process.env.EKART_MERCHANT_CODE || "").trim().toUpperCase();
  },
  /** Default service code for forward Non-Large create (Ekart-assigned). */
  get serviceCode() {
    return (process.env.EKART_SERVICE_CODE || "REGULAR").trim().toUpperCase() || "REGULAR";
  },
  get goodsCategory() {
    const v = (process.env.EKART_GOODS_CATEGORY || "NON_ESSENTIAL").trim().toUpperCase();
    return v === "ESSENTIAL" ? "ESSENTIAL" : "NON_ESSENTIAL";
  },
  authEndpoint: (process.env.EKART_AUTH_ENDPOINT || "/auth/token").trim() || "/auth/token",
  createEndpoint:
    (process.env.EKART_CREATE_ENDPOINT || "/v2/shipments/create").trim() || "/v2/shipments/create",
  trackEndpoint:
    (process.env.EKART_TRACK_ENDPOINT || "/v2/shipments/track").trim() || "/v2/shipments/track",
  createLargeEndpoint:
    (process.env.EKART_CREATE_LARGE_ENDPOINT || "/shipments/large/create").trim() ||
    "/shipments/large/create",
  trackLargeEndpoint:
    (process.env.EKART_TRACK_LARGE_ENDPOINT || "/shipments/large/track").trim() ||
    "/shipments/large/track",
  serviceabilityEndpoint:
    (process.env.EKART_SERVICEABILITY_ENDPOINT || "/v1/offerings").trim() || "/v1/offerings",
  /** Durin tokens expire ~45m; cache slightly under that. */
  tokenCacheTtlMinutes: intEnv("EKART_TOKEN_CACHE_TTL_MINUTES", 40),
  requestTimeoutMs: intEnv("EKART_TIMEOUT_MS", 30_000),
  maxTransientRetries: Math.min(3, Math.max(0, intEnv("EKART_RETRY_COUNT", 2))),
  debugLogs: process.env.EKART_DEBUG_LOGS === "1",
  maxConcurrentRequests: intEnv("EKART_MAX_CONCURRENT_REQUESTS", 6),
};
