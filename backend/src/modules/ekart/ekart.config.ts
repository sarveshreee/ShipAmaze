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

/** Cancel/RTO/Cancel RVP — defaults on with Ekart booking unless explicitly disabled. */
export function isEkartCancelEnabledFlag(): boolean {
  const raw = process.env.EKART_CANCEL_ENABLED;
  if (raw !== undefined && raw.trim() !== "") {
    return truthy(raw);
  }
  return isEkartEnabledFlag();
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
  /**
   * Registered Elite pickup location_code (e.g. TEC_SUR_01).
   * Durin FORWARD examples use this for source; Elite lists by registered locations.
   * Pickup.ekartLocationCode overrides this when set.
   */
  get defaultLocationCode() {
    return (process.env.EKART_DEFAULT_LOCATION_CODE || "").trim();
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
  /** Durin PUT /v3/shipments/rto/create — forward cancel via RTO. */
  rtoCreateEndpoint:
    (process.env.EKART_RTO_CREATE_ENDPOINT || "/v3/shipments/rto/create").trim() ||
    "/v3/shipments/rto/create",
  /** Durin PUT /v3/shipments/cancel_rvp — cancel reverse (RVP) pickup. */
  cancelRvpEndpoint:
    (process.env.EKART_CANCEL_RVP_ENDPOINT || "/v3/shipments/cancel_rvp").trim() ||
    "/v3/shipments/cancel_rvp",
  /** Reverse create service_code (Durin example: RETURNS_SMART_CHECK). */
  get reverseServiceCode() {
    return (
      (process.env.EKART_REVERSE_SERVICE_CODE || "RETURNS_SMART_CHECK").trim().toUpperCase() ||
      "RETURNS_SMART_CHECK"
    );
  },
  serviceabilityEndpoint:
    (process.env.EKART_SERVICEABILITY_ENDPOINT || "/v1/offerings").trim() || "/v1/offerings",
  /**
   * Critical Updates push receiver. When false, endpoint returns 503;
   * polling remains the operational source of truth.
   */
  get webhooksEnabled() {
    return truthy(process.env.EKART_WEBHOOKS_ENABLED);
  },
  /**
   * Cancel / RTO / Cancel RVP. Defaults to on when Ekart booking is enabled so
   * Reship can cancel ghost AWBs at Durin; set EKART_CANCEL_ENABLED=false to disable.
   */
  get cancelEnabled() {
    return isEkartCancelEnabledFlag();
  },
  /** Optional shared secret for webhook Authorization / X-Ekart-Webhook-Secret. */
  get webhookSecret() {
    return (process.env.EKART_WEBHOOK_SECRET || "").trim();
  },
  /** Durin tokens expire ~45m; cache slightly under that. */
  tokenCacheTtlMinutes: intEnv("EKART_TOKEN_CACHE_TTL_MINUTES", 40),
  requestTimeoutMs: intEnv("EKART_TIMEOUT_MS", 30_000),
  maxTransientRetries: Math.min(3, Math.max(0, intEnv("EKART_RETRY_COUNT", 2))),
  debugLogs: process.env.EKART_DEBUG_LOGS === "1",
  maxConcurrentRequests: intEnv("EKART_MAX_CONCURRENT_REQUESTS", 6),
};
