import { ApiError } from "@/lib/apiClient";

function coerceMessageValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(coerceMessageValue).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "description", "reason", "msg"]) {
      const nested = coerceMessageValue(o[key]);
      if (nested) return nested;
    }
    if (o.errors && typeof o.errors === "object") {
      const parts = Object.entries(o.errors as Record<string, unknown>).flatMap(([field, v]) => {
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

/** User-facing message from API errors, fetch failures, or thrown values. */
export function errorMessageFromUnknown(err: unknown, fallback = "Request failed"): string {
  if (err instanceof ApiError) {
    const fromBody = coerceMessageValue(err.body);
    if (fromBody) return fromBody;
    if (err.message.trim() && err.message !== "[object Object]") return err.message;
  }
  if (err instanceof Error) {
    if (err.message.trim() && err.message !== "[object Object]") return err.message;
  }
  return coerceMessageValue(err) || fallback;
}
