function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const velocityConfig = {
  baseUrl: (process.env.VELOCITY_BASE_URL || "https://shazam.velocity.in").replace(/\/$/, ""),
  username: process.env.VELOCITY_USERNAME || "",
  password: process.env.VELOCITY_PASSWORD || "",
  tokenCacheTtlMinutes: intEnv("VELOCITY_TOKEN_CACHE_TTL_MINUTES", 1320),
  /** HTTP timeout for each Velocity API call (ms). */
  requestTimeoutMs: intEnv("VELOCITY_REQUEST_TIMEOUT_MS", 45_000),
  /** Retries for transient HTTP / network failures (not counting auth refresh). */
  maxTransientRetries: Math.min(3, Math.max(0, intEnv("VELOCITY_MAX_TRANSIENT_RETRIES", 2))),
  debugLogs: process.env.VELOCITY_DEBUG_LOGS === "1",
};
