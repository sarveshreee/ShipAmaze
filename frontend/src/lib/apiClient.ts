const TOKEN_KEY = "shipamaze_token";
/** Stashed admin JWT while impersonating another user. */
const ADMIN_TOKEN_KEY = "adminToken";
/** Cached user profile for instant session restore (tab-scoped). */
const USER_KEY = "shipamaze_user";

/** Session storage — token expires when browser tab closes. */
function authStorage(): Storage {
  return sessionStorage;
}

export function getStoredToken(): string | null {
  return authStorage().getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  const storage = authStorage();
  if (token) storage.setItem(TOKEN_KEY, token);
  else storage.removeItem(TOKEN_KEY);
}

export function getStoredUserJson(): string | null {
  return authStorage().getItem(USER_KEY);
}

export function setStoredUserJson(userJson: string | null) {
  const storage = authStorage();
  if (userJson) storage.setItem(USER_KEY, userJson);
  else storage.removeItem(USER_KEY);
}

export function getAdminToken(): string | null {
  return authStorage().getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
  const storage = authStorage();
  if (token) storage.setItem(ADMIN_TOKEN_KEY, token);
  else storage.removeItem(ADMIN_TOKEN_KEY);
}

export function clearAdminToken() {
  authStorage().removeItem(ADMIN_TOKEN_KEY);
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

/** In-flight GET dedupe: identical pending GETs share one network request. */
const inflightGets = new Map<string, Promise<unknown>>();

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
  const method = (rest.method ?? "GET").toUpperCase();

  // Deduplicate concurrent identical GETs (skip when AbortSignal present — RQ cancels per query).
  if (method === "GET" && !body && !rest.signal) {
    const dedupeKey = `${hadToken ? "1" : "0"}:${path}`;
    const existing = inflightGets.get(dedupeKey);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      try {
        return await executeRequest<T>(url, { ...rest, headers, body }, hadToken);
      } finally {
        inflightGets.delete(dedupeKey);
      }
    })();
    inflightGets.set(dedupeKey, promise);
    return promise;
  }

  return executeRequest<T>(url, { ...rest, headers, body }, hadToken);
}

async function executeRequest<T>(
  url: string,
  init: RequestInit,
  hadToken: boolean
): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401 && hadToken) {
    setStoredToken(null);
    clearAdminToken();
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
  get: <T>(path: string, init?: { signal?: AbortSignal }) =>
    apiRequest<T>(path, { method: "GET", signal: init?.signal }),
  post: <T>(path: string, json?: unknown, init?: { signal?: AbortSignal }) =>
    apiRequest<T>(path, { method: "POST", json, signal: init?.signal }),
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
