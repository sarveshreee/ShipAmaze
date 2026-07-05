import type { Request } from "express";

export type ParsedClientContext = {
  ipAddress: string;
  browser: string;
  operatingSystem: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  userAgent: string;
  location?: string;
};

function firstForwardedIp(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  return raw.split(",")[0]?.trim() ?? "";
}

export function getClientIp(req: Request): string {
  const forwarded = firstForwardedIp(req.headers["x-forwarded-for"] as string | undefined);
  if (forwarded) return forwarded;
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return req.socket.remoteAddress ?? "";
}

function detectDeviceType(ua: string): ParsedClientContext["deviceType"] {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)) return "mobile";
  if (s.includes("windows") || s.includes("macintosh") || s.includes("linux")) return "desktop";
  return "unknown";
}

function detectBrowser(ua: string): string {
  const s = ua.toLowerCase();
  if (s.includes("edg/")) return "Edge";
  if (s.includes("opr/") || s.includes("opera")) return "Opera";
  if (s.includes("chrome/") && !s.includes("edg/")) return "Chrome";
  if (s.includes("safari/") && !s.includes("chrome/")) return "Safari";
  if (s.includes("firefox/")) return "Firefox";
  return ua ? "Other" : "Unknown";
}

function detectOs(ua: string): string {
  const s = ua.toLowerCase();
  if (s.includes("windows nt 10")) return "Windows 10/11";
  if (s.includes("windows")) return "Windows";
  if (s.includes("mac os x") || s.includes("macintosh")) return "macOS";
  if (s.includes("android")) return "Android";
  if (s.includes("iphone") || s.includes("ipad") || s.includes("ios")) return "iOS";
  if (s.includes("linux")) return "Linux";
  return ua ? "Other" : "Unknown";
}

/** Best-effort client metadata from request headers (no external geo lookup). */
export function parseClientContext(req: Request): ParsedClientContext {
  const userAgent = String(req.headers["user-agent"] ?? "").trim();
  const country = String(req.headers["cf-ipcountry"] ?? req.headers["x-vercel-ip-country"] ?? "").trim();
  const city = String(req.headers["x-appengine-city"] ?? "").trim();
  const location =
    country && city ? `${city}, ${country}` : country || city || undefined;

  return {
    ipAddress: getClientIp(req),
    browser: detectBrowser(userAgent),
    operatingSystem: detectOs(userAgent),
    deviceType: detectDeviceType(userAgent),
    userAgent: userAgent.slice(0, 500),
    location,
  };
}
