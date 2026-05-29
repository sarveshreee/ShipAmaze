/** Development-only logging. Errors always go to stderr in all environments. */

const isProd = process.env.NODE_ENV === "production";

export const devLog = {
  info(...args: unknown[]) {
    if (!isProd) console.info(...args);
  },
  warn(...args: unknown[]) {
    if (!isProd) console.warn(...args);
  },
  error(...args: unknown[]) {
    console.error(...args);
  },
};

/** Production-safe audit line for security-sensitive events (no secrets). */
export function auditLog(event: string, meta: Record<string, unknown>) {
  console.warn(`[audit] ${event}`, meta);
}
