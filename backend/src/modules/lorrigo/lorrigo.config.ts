function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function truthy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Feature flag — when false, Lorrigo is not initialized or registered. */
export function isLorrigoEnabledFlag(): boolean {
  return truthy(process.env.LORRIGO_ENABLED);
}

/** Credentials present (independent of feature flag). */
export function isLorrigoConfigured(): boolean {
  return !!(process.env.LORRIGO_EMAIL?.trim() && process.env.LORRIGO_PASSWORD?.trim());
}

export const lorrigoConfig = {
  get enabled() {
    return isLorrigoEnabledFlag();
  },
  baseUrl: (process.env.LORRIGO_BASE_URL || "https://app.lorrigo.com/api").replace(/\/$/, ""),
  get email() {
    return process.env.LORRIGO_EMAIL?.trim() || "";
  },
  get password() {
    return process.env.LORRIGO_PASSWORD || "";
  },
  /** Default 120 minutes until Lorrigo documents token TTL. */
  tokenCacheTtlMinutes: intEnv("LORRIGO_TOKEN_CACHE_TTL_MINUTES", 120),
  requestTimeoutMs: intEnv("LORRIGO_REQUEST_TIMEOUT_MS", 45_000),
  maxTransientRetries: Math.min(3, Math.max(0, intEnv("LORRIGO_MAX_TRANSIENT_RETRIES", 2))),
  debugLogs: process.env.LORRIGO_DEBUG_LOGS === "1",
};
