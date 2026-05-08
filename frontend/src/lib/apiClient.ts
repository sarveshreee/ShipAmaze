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
  if (u) return u.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://localhost:5000/api";
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

function shouldAttachAuthToken(path: string): boolean {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (
    p === "/auth/login" ||
    p === "/auth/register" ||
    p === "/auth/forgot-password" ||
    p === "/auth/reset-password"
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
    if (!/^\/(login|signup|forgot-password)(\/|$)/i.test(pathOnly)) {
      window.location.replace(`${window.location.origin}/login`);
    }
  }

  const data = await parseBody(res);

  if (!res.ok) {
    let msg = res.statusText || "Request failed";
    if (typeof data === "object" && data !== null) {
      const o = data as { message?: string; error?: string };
      if (typeof o.message === "string" && o.message.trim()) msg = o.message;
      else if (typeof o.error === "string" && o.error.trim()) msg = o.error;
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
export async function downloadAuthenticatedFile(path: string, fallbackName: string): Promise<void> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getStoredToken();
  const headers: Record<string, string> = { Accept: "text/csv, */*" };
  if (token && shouldAttachAuthToken(path)) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (res.status === 401 && token) {
    setStoredToken(null);
    window.dispatchEvent(new CustomEvent("shipamaze:unauthorized"));
  }
  if (!res.ok) {
    const data = await parseBody(res);
    let msg = res.statusText || "Download failed";
    if (typeof data === "object" && data !== null) {
      const o = data as { message?: string };
      if (typeof o.message === "string" && o.message.trim()) msg = o.message;
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
