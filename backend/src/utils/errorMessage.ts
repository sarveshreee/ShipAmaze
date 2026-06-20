/** Turn API/provider error payloads into a readable string (never "[object Object]"). */
export function coerceMessageValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(coerceMessageValue).filter(Boolean);
    return parts.join("; ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "description", "reason", "msg"]) {
      const nested = coerceMessageValue(o[key]);
      if (nested) return nested;
    }
    if (o.errors && typeof o.errors === "object") {
      const errObj = o.errors as Record<string, unknown>;
      const parts = Object.entries(errObj).flatMap(([field, v]) => {
        const m = coerceMessageValue(v);
        return m ? [`${field}: ${m}`] : [];
      });
      if (parts.length) return parts.join("; ");
    }
    try {
      const json = JSON.stringify(value);
      if (json && json !== "{}") {
        return json.length > 400 ? `${json.slice(0, 397)}…` : json;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function extractProviderErrorMessage(data: unknown): string {
  if (typeof data === "string") return data.trim();
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    const meta = d.meta as Record<string, unknown> | undefined;
    const metaMsg = coerceMessageValue(meta?.message);
    if (metaMsg) return metaMsg;
    const direct = coerceMessageValue(d.message ?? d.error ?? d.detail ?? d.errors);
    if (direct) return direct;
  }
  return "";
}

export function formatErrorMessage(err: unknown, fallback = "Request failed"): string {
  if (err instanceof Error) {
    const anyErr = err as Error & { providerError?: unknown };
    if (anyErr.providerError != null) {
      const fromProvider = extractProviderErrorMessage(anyErr.providerError);
      if (fromProvider) return fromProvider;
    }
    const msg = err.message?.trim();
    if (msg && msg !== "[object Object]") return msg;
  }
  const coerced = coerceMessageValue(err);
  return coerced || fallback;
}
