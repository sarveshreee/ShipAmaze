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

export function getMailTransportStatus(): "gmail" | "smtp" | "none" {
  const r = resolveSmtp();
  if (!r) return "none";
  return r.kind;
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

function logSendFailure(err: unknown): void {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    console.warn("[email] Email send failed: transport error");
  } else {
    const msg = err instanceof Error ? err.message : "unknown_error";
    console.warn("[email] Email send failed:", msg);
  }
}

/**
 * Sends email via Nodemailer (Gmail service or SMTP). Never logs app passwords or message bodies.
 */
export async function sendMailWithSmtp(
  payload: SendMailPayload,
  opts?: { throwOnFailure?: boolean }
): Promise<{ ok: true; messageId?: string } | { ok: false; reason: string }> {
  const cfg = resolveSmtp();
  const isProd = process.env.NODE_ENV === "production";

  if (!cfg) {
    if (!isProd) {
      console.info(
        "[email] Transactional email skipped: set EMAIL_FROM+EMAIL_PASS, GMAIL_USER+GMAIL_APP_PASSWORD, or SMTP_*."
      );
    }
    if (opts?.throwOnFailure) {
      throw new Error("Email transport is not configured");
    }
    return { ok: false, reason: "transport_not_configured" };
  }

  const nodemailer = (await import("nodemailer")).default;
  const transporter =
    cfg.kind === "gmail"
      ? nodemailer.createTransport({
          service: "gmail",
          auth: cfg.auth,
        })
      : nodemailer.createTransport({
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
