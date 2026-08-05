function maskPhoneForLog(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function maskEmailForLog(raw: string): string {
  const [local, domain] = raw.split("@");
  if (!domain) return "***";
  const l = local.length <= 2 ? "*" : `${local.slice(0, 1)}***${local.slice(-1)}`;
  return `${l}@${domain}`;
}

/** Deep-copy and mask PII / secrets suitable for stdout logs. */
export function sanitizeForProviderLog(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload.map(sanitizeForProviderLog);

  const o = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(o)) {
    const v = o[key];
    const kl = key.toLowerCase();

    if (kl.includes("phone") || kl.includes("mobile") || kl === "contact_phone") {
      out[key] = typeof v === "string" ? maskPhoneForLog(v) : v;
      continue;
    }
    if (kl.includes("email")) {
      out[key] = typeof v === "string" ? maskEmailForLog(v) : v;
      continue;
    }
    if (
      kl.includes("authorization") ||
      kl.includes("password") ||
      kl.includes("token") ||
      kl.includes("secret") ||
      kl.includes("api_key") ||
      kl.includes("apikey") ||
      kl.includes("merchant_code") ||
      kl === "http_x_merchant_code" ||
      kl === "client_name"
    ) {
      out[key] = "***MASKED***";
      continue;
    }

    out[key] = typeof v === "object" ? sanitizeForProviderLog(v) : v;
  }
  return out;
}
