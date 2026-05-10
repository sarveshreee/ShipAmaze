/** Trim and strip optional surrounding quotes from .env values. */
export function envTrim(key: string): string {
  const v = process.env[key];
  if (v == null || v === "") return "";
  let s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export type ResolvedSmtp = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  from: string;
  replyTo?: string;
};

export type BrandEmailConfig = {
  logoUrl: string;
  supportEmail: string;
  websiteUrl: string;
  primaryColor: string;
  fromName: string;
};

export function getBrandEmailConfig(): BrandEmailConfig {
  return {
    logoUrl: envTrim("BRAND_LOGO_URL") || "",
    supportEmail: envTrim("BRAND_SUPPORT_EMAIL") || envTrim("SMTP_USER") || envTrim("GMAIL_USER") || "",
    websiteUrl: envTrim("BRAND_WEBSITE_URL") || envTrim("FRONTEND_URL") || "http://localhost:8080",
    primaryColor: envTrim("BRAND_PRIMARY_COLOR") || "#2563eb",
    fromName: envTrim("MAIL_FROM_NAME") || "ShipAmaze",
  };
}

function buildFromHeader(): string {
  const name = envTrim("MAIL_FROM_NAME") || "ShipAmaze";
  const addr = envTrim("MAIL_FROM_EMAIL");
  if (addr) return `${name} <${addr}>`;
  const legacy = envTrim("SMTP_FROM");
  if (legacy) return legacy;
  const gu = envTrim("GMAIL_USER");
  if (gu) return `${name} <${gu}>`;
  return "";
}

/**
 * Resolve SMTP: prefers explicit SMTP_* + MAIL_FROM_*, or Gmail shorthand (GMAIL_USER + GMAIL_APP_PASSWORD).
 */
export function resolveSmtp(): ResolvedSmtp | null {
  const gmailUser = envTrim("GMAIL_USER");
  const gmailAppPass = envTrim("GMAIL_APP_PASSWORD");

  if (gmailUser && gmailAppPass) {
    const from = buildFromHeader() || `ShipAmaze <${gmailUser}>`;
    return {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: gmailUser, pass: gmailAppPass.replace(/\s+/g, "") },
      from,
      replyTo: gmailUser,
    };
  }

  const host = envTrim("SMTP_HOST");
  const user = envTrim("SMTP_USER");
  const pass = envTrim("SMTP_PASS");
  const from = buildFromHeader();

  if (!host || !user || !pass) {
    if (host && (!user || !pass)) {
      console.error("[email] SMTP_HOST is set but SMTP_USER / SMTP_PASS are missing.");
    }
    return null;
  }
  if (!from) {
    console.error("[email] MAIL_FROM_EMAIL (or SMTP_FROM / GMAIL_USER) is required when using SMTP_HOST.");
    return null;
  }

  const port = Number(envTrim("SMTP_PORT") || "587");
  const secure = envTrim("SMTP_SECURE") === "true" || port === 465;

  return {
    host,
    port,
    secure,
    auth: { user, pass },
    from,
    replyTo: user,
  };
}

export function isSmtpReady(): boolean {
  return resolveSmtp() !== null;
}

export type SendMailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Sends email via Nodemailer. On failure logs a safe message and rethrows only if throwOnFailure is true.
 */
export async function sendMailWithSmtp(
  payload: SendMailPayload,
  opts?: { throwOnFailure?: boolean }
): Promise<{ ok: true; messageId?: string } | { ok: false; reason: string }> {
  const cfg = resolveSmtp();
  const isProd = process.env.NODE_ENV === "production";

  if (!cfg) {
    if (!isProd) {
      console.info(`[email] SMTP not configured; skipped send to=${payload.to} subject="${payload.subject}"`);
    } else {
      console.warn(`[email] SMTP not configured; cannot send to=${payload.to} subject="${payload.subject}"`);
    }
    if (opts?.throwOnFailure) {
      throw new Error("SMTP is not configured");
    }
    return { ok: false, reason: "smtp_not_configured" };
  }

  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    ...(cfg.port === 587 && !cfg.secure
      ? {
          requireTLS: true,
          tls: { minVersion: "TLSv1.2" as const },
        }
      : {}),
  });

  if (envTrim("SMTP_VERIFY") === "true") {
    await transporter.verify();
    if (!isProd) console.info("[email] SMTP verify() OK");
  }

  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: cfg.replyTo,
    });
    if (envTrim("SMTP_DEBUG") === "true" && !isProd) {
      console.info("[email] sendMail:", info.messageId, info.response);
    }
    return { ok: true, messageId: info.messageId as string | undefined };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "send_failed";
    console.error("[email] sendMail failed:", msg);
    if (opts?.throwOnFailure) throw e;
    return { ok: false, reason: msg };
  }
}
