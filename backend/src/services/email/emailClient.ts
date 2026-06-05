import { safeErrorMessage } from "../../utils/logRedact.js";
import { resolveApiMail, sendMailViaApi, type SendMailPayload } from "./emailApiTransport.js";

export type { SendMailPayload };

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

/** Resolved outbound mail: Gmail App Password (preferred) or generic SMTP. */
export type ResolvedSmtp =
  | {
      kind: "gmail";
      from: string;
      replyTo?: string;
      auth: { user: string; pass: string };
    }
  | {
      kind: "smtp";
      host: string;
      port: number;
      secure: boolean;
      from: string;
      replyTo?: string;
      auth: { user: string; pass: string };
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
    supportEmail:
      envTrim("BRAND_SUPPORT_EMAIL") || envTrim("EMAIL_FROM") || envTrim("GMAIL_USER") || envTrim("SMTP_USER") || "",
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
  const ef = envTrim("EMAIL_FROM");
  if (ef) return `${name} <${ef}>`;
  return "";
}

/**
 * Resolve mail transport (priority):
 * 1. `EMAIL_FROM` + `EMAIL_PASS` — Gmail App Password (same Nodemailer `service: 'gmail'` as below)
 * 2. `GMAIL_USER` + `GMAIL_APP_PASSWORD` — Gmail App Password
 * 3. Custom SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, plus From via MAIL_FROM_EMAIL / SMTP_FROM / GMAIL_USER / EMAIL_FROM)
 * 4. null — development-safe skip (no secrets / OTPs logged here)
 */
export function resolveSmtp(): ResolvedSmtp | null {
  const emailFrom = envTrim("EMAIL_FROM");
  const emailPass = envTrim("EMAIL_PASS");
  if (emailFrom && emailPass) {
    const login = emailFrom.toLowerCase();
    const from = buildFromHeader() || `ShipAmaze <${login}>`;
    return {
      kind: "gmail",
      from,
      replyTo: login,
      auth: { user: login, pass: emailPass.replace(/\s+/g, "") },
    };
  }

  const gmailUser = envTrim("GMAIL_USER");
  const gmailAppPass = envTrim("GMAIL_APP_PASSWORD");

  if (gmailUser && gmailAppPass) {
    const from = buildFromHeader() || `ShipAmaze <${gmailUser}>`;
    return {
      kind: "gmail",
      from,
      replyTo: gmailUser,
      auth: { user: gmailUser, pass: gmailAppPass.replace(/\s+/g, "") },
    };
  }

  const host = envTrim("SMTP_HOST");
  const user = envTrim("SMTP_USER");
  const pass = envTrim("SMTP_PASS");
  const from = buildFromHeader();

  if (!host || !user || !pass) {
    if (host && (!user || !pass)) {
      console.warn("[email] SMTP_HOST is set but SMTP_USER or SMTP_PASS is missing; outbound mail disabled.");
    }
    return null;
  }
  if (!from) {
    console.warn(
      "[email] Custom SMTP requires a From address: set MAIL_FROM_EMAIL (or SMTP_FROM, EMAIL_FROM, or GMAIL_USER)."
    );
    return null;
  }

  const port = Number(envTrim("SMTP_PORT") || "587");
  const secure = envTrim("SMTP_SECURE") === "true" || port === 465;

  return {
    kind: "smtp",
    host,
    port,
    secure,
    from,
    replyTo: user,
    auth: { user, pass },
  };
}

export function getMailTransportStatus(): "brevo" | "resend" | "gmail" | "smtp" | "none" {
  const api = resolveApiMail();
  if (api?.provider === "brevo") return "brevo";
  if (api?.provider === "resend") return "resend";
  const r = resolveSmtp();
  if (!r) return "none";
  return r.kind;
}

export function isSmtpReady(): boolean {
  return resolveApiMail() !== null || resolveSmtp() !== null;
}

function warnRenderSmtpBlocked(): void {
  if (process.env.NODE_ENV !== "production" || resolveApiMail()) return;
  if (!resolveSmtp()) return;
  console.warn(
    "[email] SMTP/Gmail is configured but Render free tier blocks outbound ports 25/465/587. " +
      "Set BREVO_API_KEY or RESEND_API_KEY for production email delivery."
  );
}

function logSendFailure(err: unknown): void {
  console.warn("[email] Email send failed:", safeErrorMessage(err));
}

function smtpTimeoutMs(key: string, fallback: number): number {
  const n = Number(envTrim(key));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Nodemailer transport options tuned for cloud hosts (Render, etc.) where `service: "gmail"` often times out. */
export function buildNodemailerTransportOptions(cfg: ResolvedSmtp) {
  const connectionTimeout = smtpTimeoutMs("SMTP_CONNECTION_TIMEOUT_MS", 30_000);
  const greetingTimeout = smtpTimeoutMs("SMTP_GREETING_TIMEOUT_MS", 30_000);
  const socketTimeout = smtpTimeoutMs("SMTP_SOCKET_TIMEOUT_MS", 60_000);
  const forceIpv4 = envTrim("SMTP_FORCE_IPV4") !== "false";

  const common = {
    auth: cfg.auth,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    ...(forceIpv4 ? { family: 4 as const } : {}),
  };

  if (cfg.kind === "gmail") {
    const port = Number(envTrim("GMAIL_SMTP_PORT") || "587") || 587;
    const secure = port === 465;
    return {
      host: envTrim("GMAIL_SMTP_HOST") || "smtp.gmail.com",
      port,
      secure,
      ...common,
      ...(port === 587 && !secure
        ? {
            requireTLS: true,
            tls: { minVersion: "TLSv1.2" as const },
          }
        : {}),
    };
  }

  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    ...common,
    ...(cfg.port === 587 && !cfg.secure
      ? {
          requireTLS: true,
          tls: { minVersion: "TLSv1.2" as const },
        }
      : {}),
  };
}

/**
 * Sends email via Nodemailer (Gmail SMTP or custom SMTP). Never logs app passwords or message bodies.
 */
export async function sendMailWithSmtp(
  payload: SendMailPayload,
  opts?: { throwOnFailure?: boolean }
): Promise<{ ok: true; messageId?: string } | { ok: false; reason: string }> {
  const isProd = process.env.NODE_ENV === "production";
  const apiCfg = resolveApiMail();

  if (apiCfg) {
    try {
      const result = await sendMailViaApi(apiCfg, payload);
      console.info(`[email] Email sent successfully via ${apiCfg.provider}`);
      return { ok: true, messageId: result.id };
    } catch (e: unknown) {
      logSendFailure(e);
      if (opts?.throwOnFailure) throw e;
      return { ok: false, reason: "api_send_failed" };
    }
  }

  warnRenderSmtpBlocked();

  const cfg = resolveSmtp();
  if (!cfg) {
    if (!isProd) {
      console.info(
        "[email] Transactional email skipped: set BREVO_API_KEY, RESEND_API_KEY, EMAIL_FROM+EMAIL_PASS, or SMTP_*."
      );
    }
    if (opts?.throwOnFailure) {
      throw new Error("Email transport is not configured");
    }
    return { ok: false, reason: "transport_not_configured" };
  }

  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport(buildNodemailerTransportOptions(cfg));

  if (envTrim("SMTP_VERIFY") === "true") {
    try {
      await transporter.verify();
      if (!isProd) {
        console.info("[email] Email transport verified successfully");
      }
    } catch (e: unknown) {
      logSendFailure(e);
      if (opts?.throwOnFailure) throw e;
      return { ok: false, reason: "verify_failed" };
    }
  }

  try {
    await transporter.sendMail({
      from: cfg.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: cfg.replyTo,
    });
    console.info("[email] Email sent successfully");
    return { ok: true };
  } catch (e: unknown) {
    logSendFailure(e);
    if (opts?.throwOnFailure) throw e;
    return { ok: false, reason: "send_failed" };
  }
}
