export const velocityConfig = {
  baseUrl: (process.env.VELOCITY_BASE_URL || "https://shazam.velocity.in").replace(/\/$/, ""),
  username: process.env.VELOCITY_USERNAME || "",
  password: process.env.VELOCITY_PASSWORD || "",
  tokenCacheTtlMinutes: parseInt(process.env.VELOCITY_TOKEN_CACHE_TTL_MINUTES || "1320", 10),
};
