import { safeErrorMessage } from "../../utils/logRedact.js";

export type SendMailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** Trim and strip optional surrounding quotes from .env values. */
function envTrim(key: string): string {
  const v = process.env[key];
  if (v == null || v === "") return "";
  let s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export type ResolvedApiMail =
  | { provider: "brevo"; apiKey: string; from: { name: string; email: string }; replyTo?: string }
  | { provider: "resend"; apiKey: string; from: string; replyTo?: string };

function buildSenderAddress(): { name: string; email: string } {
  const name = envTrim("MAIL_FROM_NAME") || "ShipAmaze";
  const email =
    envTrim("BREVO_FROM_EMAIL") ||
    envTrim("RESEND_FROM") ||
    envTrim("RESEND_FROM_EMAIL") ||
    envTrim("MAIL_FROM_EMAIL") ||
    envTrim("EMAIL_FROM") ||
    envTrim("GMAIL_USER") ||
    "";
  return { name, email };
}

function buildReplyTo(): string | undefined {
  const r =
    envTrim("EMAIL_FROM") ||
    envTrim("GMAIL_USER") ||
    envTrim("BRAND_SUPPORT_EMAIL") ||
    envTrim("MAIL_FROM_EMAIL") ||
    "";
  return r || undefined;
}

/** Brevo (Sendinblue) HTTP API — works on Render free tier; verify sender email in Brevo dashboard. */
export function resolveBrevoApi(): ResolvedApiMail | null {
  const apiKey = envTrim("BREVO_API_KEY");
  if (!apiKey) return null;
  const sender = buildSenderAddress();
  if (!sender.email) {
    console.warn("[email] BREVO_API_KEY is set but no sender email (MAIL_FROM_EMAIL / EMAIL_FROM).");
    return null;
  }
  return { provider: "brevo", apiKey, from: sender, replyTo: buildReplyTo() };
}

/** Resend HTTP API — works on Render free tier; verify domain for arbitrary recipients. */
export function resolveResendApi(): ResolvedApiMail | null {
  const apiKey = envTrim("RESEND_API_KEY");
  if (!apiKey) return null;
  const { name, email } = buildSenderAddress();
  const fromEmail = email || "onboarding@resend.dev";
  const from = fromEmail.includes("<") ? fromEmail : `${name} <${fromEmail}>`;
  return { provider: "resend", apiKey, from, replyTo: buildReplyTo() };
}

/**
 * HTTP email APIs (HTTPS port 443) — required on Render free tier which blocks SMTP ports 25/465/587.
 * Priority: Brevo → Resend.
 */
export function resolveApiMail(): ResolvedApiMail | null {
  return resolveBrevoApi() ?? resolveResendApi();
}

export async function sendMailViaApi(cfg: ResolvedApiMail, payload: SendMailPayload): Promise<{ id?: string }> {
  if (cfg.provider === "brevo") {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": cfg.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: cfg.from,
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.html,
        textContent: payload.text,
        replyTo: cfg.replyTo ? { email: cfg.replyTo } : undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Brevo API ${res.status}: ${safeErrorMessage(body).slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { id: data.messageId };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: cfg.replyTo,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${safeErrorMessage(body).slice(0, 200)}`);
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: data.id };
}
