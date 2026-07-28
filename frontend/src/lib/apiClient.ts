const TOKEN_KEY = "shipamaze_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function baseUrl(): string {
  const u = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (u) {
    const normalized = u.replace(/\/$/, "");
    // Guardrail: if env is set to host-only URL, append /api automatically.
    if (/\/api$/i.test(normalized)) return normalized;
    return `${normalized}/api`;
  }
  // Same-origin via Vite proxy (see vite.config.ts) — works with localhost and ngrok
  if (import.meta.env.DEV) return "/api";
  if (typeof console !== "undefined") {
    console.error(
      "[ShipAmaze] VITE_API_BASE_URL is not set. Configure it in Vercel (or your host) to your Render API base URL including /api."
    );
  }
  return "";
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function coerceApiErrorText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(coerceApiErrorText).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "description", "reason", "msg"]) {
      const nested = coerceApiErrorText(o[key]);
      if (nested) return nested;
    }
    if (o.errors && typeof o.errors === "object") {
      const parts = Object.entries(o.errors as Record<string, unknown>).flatMap(([field, v]) => {
        const m = coerceApiErrorText(v);
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

function shouldAttachAuthToken(path: string): boolean {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (
    p === "/auth/login" ||
    p === "/auth/register" ||
    p === "/auth/send-otp" ||
    p === "/auth/verify-otp" ||
    p === "/auth/resend-otp" ||
    p === "/auth/verify-email-otp" ||
    p === "/auth/resend-email-otp" ||
    p === "/auth/forgot-password" ||
    p === "/auth/reset-password" ||
    p === "/public/settings/label-invoice"
  ) {
    return false;
  }
  return true;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  const token = getStoredToken();
  const hadToken = !!(token && shouldAttachAuthToken(path));
  if (token && shouldAttachAuthToken(path)) headers.Authorization = `Bearer ${token}`;

  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const { json, ...rest } = init;
  const body = json !== undefined ? JSON.stringify(json) : rest.body;

  const res = await fetch(url, { ...rest, headers, body });

  if (res.status === 401 && hadToken) {
    setStoredToken(null);
    window.dispatchEvent(new CustomEvent("shipamaze:unauthorized"));
    const pathOnly = window.location.pathname;
    if (!/^\/(login|signup|forgot-password|verify-email)(\/|$)/i.test(pathOnly)) {
      window.location.replace(`${window.location.origin}/login`);
    }
  }

  const data = await parseBody(res);

  if (!res.ok) {
    let msg = res.statusText || "Request failed";
    if (typeof data === "object" && data !== null) {
      const o = data as { message?: unknown; error?: unknown; providerError?: unknown };
      const fromMessage = coerceApiErrorText(o.message ?? o.error);
      if (fromMessage) msg = fromMessage;
      else {
        const fromProvider = coerceApiErrorText(o.providerError);
        if (fromProvider) msg = fromProvider;
      }
    }
    throw new ApiError(res.status, msg, data);
  }

  return data as T;
}

export const apiClient = {
  get: <T>(path: string) => apiRequest<T>(path, { method: "GET" }),
  post: <T>(path: string, json?: unknown) => apiRequest<T>(path, { method: "POST", json }),
  put: <T>(path: string, json?: unknown) => apiRequest<T>(path, { method: "PUT", json }),
  patch: <T>(path: string, json?: unknown) => apiRequest<T>(path, { method: "PATCH", json }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

/** Authenticated download (CSV, etc.). Uses filename from Content-Disposition when present. */
export async function downloadAuthenticatedFile(
  path: string,
  fallbackName: string,
  init?: { method?: "GET" | "POST"; json?: unknown }
): Promise<void> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getStoredToken();
  const headers: Record<string, string> = { Accept: "text/csv, */*" };
  if (token && shouldAttachAuthToken(path)) headers.Authorization = `Bearer ${token}`;
  if (init?.json !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  if (res.status === 401 && token) {
    setStoredToken(null);
    window.dispatchEvent(new CustomEvent("shipamaze:unauthorized"));
  }
  if (!res.ok) {
    const data = await parseBody(res);
    let msg = res.statusText || "Download failed";
    if (typeof data === "object" && data !== null) {
      const fromMessage = coerceApiErrorText((data as { message?: unknown }).message);
      if (fromMessage) msg = fromMessage;
    }
    throw new ApiError(res.status, msg, data);
  }

  let filename = fallbackName;
  const cd = res.headers.get("Content-Disposition");
  const m = cd?.match(/filename="([^"]+)"/i) ?? cd?.match(/filename=([^;]+)/i);
  if (m?.[1]) filename = m[1].trim().replace(/^["']|["']$/g, "");

  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
