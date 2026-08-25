/** Fire a cheap CORS-enabled health check so TLS + preflight are warm before login. */
export function warmupApi(): void {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (!raw) return;
  try {
    const origin = new URL(raw.replace(/\/api\/?$/i, "")).origin;
    void fetch(`${origin}/health`, { method: "GET", mode: "cors", cache: "no-store", credentials: "omit" }).catch(
      () => undefined
    );
  } catch {
    /* invalid URL */
  }
}
