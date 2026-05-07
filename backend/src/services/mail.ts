type ResolvedSmtp = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  from: string;
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

/**
 * Resolve SMTP settings. Gmail shorthand (recommended):
 *   GMAIL_USER=you@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   # App Password, NOT your login password
 * Optional SMTP_FROM override; defaults to "ShipAmaze <GMAIL_USER>".
 */
export function resolveSmtp(): ResolvedSmtp | null {
  const gmailUser = envTrim("GMAIL_USER");
  const gmailAppPass = envTrim("GMAIL_APP_PASSWORD");

  if (gmailUser && gmailAppPass) {
    const from = envTrim("SMTP_FROM") || `ShipAmaze <${gmailUser}>`;
    return {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: gmailUser, pass: gmailAppPass.replace(/\s+/g, "") },
      from,
    };
  }

  const host = envTrim("SMTP_HOST");
  const from = envTrim("SMTP_FROM");
  if (!host || !from) return null;

  const user = envTrim("SMTP_USER");
  const pass = envTrim("SMTP_PASS");
  if (!user || !pass) {
    console.error(
      "[mail] SMTP_HOST and SMTP_FROM are set but SMTP_USER / SMTP_PASS are missing. Gmail needs your full email as SMTP_USER and an App Password as SMTP_PASS."
    );
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
  };
}

export function isSmtpReady(): boolean {
  return resolveSmtp() !== null;
}

export async function sendPasswordResetOtp(to: string, code: string): Promise<void> {
  const subject = "Your ShipAmaze password reset code";
  const text = `Your password reset code is: ${code}\n\nIt expires in 15 minutes. If you did not request this, you can ignore this email.`;

  const cfg = resolveSmtp();
  if (!cfg) {
    console.info(`[mail] SMTP not configured; password reset OTP for ${to}: ${code}`);
    return;
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
          tls: {
            minVersion: "TLSv1.2" as const,
          },
        }
      : {}),
  });

  if (envTrim("SMTP_VERIFY") === "true") {
    await transporter.verify();
    console.info("[mail] SMTP verify() OK");
  }

  const info = await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    text,
    replyTo: cfg.auth.user,
  });

  if (envTrim("SMTP_DEBUG") === "true") {
    console.info("[mail] sendMail result:", info.messageId, info.response);
  }
}
