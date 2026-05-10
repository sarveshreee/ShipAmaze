import { getBrandEmailConfig, type BrandEmailConfig } from "./emailClient.js";

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function roleLabel(role: string): string {
  const r = role.toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "vendor") return "Vendor";
  if (r === "dropshipper") return "Dropshipper";
  return role;
}

function wrapLayout(params: {
  brand: BrandEmailConfig;
  title: string;
  badge?: { label: string; tone?: "info" | "success" | "warning" | "danger" };
  greeting: string;
  innerHtml: string;
  cta?: { href: string; label: string };
  footerNote?: string;
}): { html: string; text: string } {
  const { brand, title, badge, greeting, innerHtml, cta, footerNote } = params;
  const primary = brand.primaryColor;
  const badgeBg =
    badge?.tone === "success"
      ? "#059669"
      : badge?.tone === "warning"
        ? "#d97706"
        : badge?.tone === "danger"
          ? "#dc2626"
          : primary;

  const logoBlock = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="ShipAmaze" width="160" style="max-width:160px;height:auto;display:block;margin:0 auto 16px;" />`
    : `<div style="font-size:22px;font-weight:700;color:${primary};text-align:center;margin-bottom:8px;">ShipAmaze</div>`;

  const badgeBlock = badge
    ? `<div style="text-align:center;margin:0 0 16px;">
         <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${badgeBg};color:#ffffff;font-size:12px;font-weight:600;letter-spacing:0.02em;">${escapeHtml(badge.label)}</span>
       </div>`
    : "";

  const ctaBlock = cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:24px auto;">
         <tr><td style="border-radius:8px;background:${primary};">
           <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
         </td></tr>
       </table>`
    : "";

  const supportLine = brand.supportEmail
    ? `Need help? <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${primary};">${escapeHtml(brand.supportEmail)}</a>`
    : "Need help? Reply to this email.";

  const siteLine = brand.websiteUrl
    ? `<a href="${escapeHtml(brand.websiteUrl)}" style="color:${primary};text-decoration:none;">${escapeHtml(brand.websiteUrl)}</a>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="padding:28px 24px 8px;text-align:center;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);">
          ${logoBlock}
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;">${escapeHtml(title)}</div>
        </td></tr>
        <tr><td style="padding:8px 24px 0;">${badgeBlock}</td></tr>
        <tr><td style="padding:8px 24px 0;font-size:16px;line-height:1.5;color:#111827;">
          <p style="margin:0 0 12px;">${greeting}</p>
          <div style="background:#f8fafc;border-radius:10px;padding:18px;border:1px solid #e2e8f0;">${innerHtml}</div>
          ${ctaBlock}
          ${footerNote ? `<p style="margin:20px 0 0;font-size:13px;color:#64748b;">${footerNote}</p>` : ""}
        </td></tr>
        <tr><td style="padding:24px;border-top:1px solid #e5e7eb;font-size:13px;color:#64748b;text-align:center;line-height:1.6;">
          <p style="margin:0 0 4px;font-weight:600;color:#0f172a;">Team ShipAmaze</p>
          <p style="margin:0;">${supportLine}</p>
          ${siteLine ? `<p style="margin:8px 0 0;">${siteLine}</p>` : ""}
        </td></tr>
      </table>
      <p style="max-width:560px;margin:16px auto 0;font-size:11px;color:#94a3b8;text-align:center;">You received this email because of activity on your ShipAmaze account.</p>
    </td></tr>
  </table>
</body></html>`;

  const textParts = [
    title,
    "",
    greeting.replace(/<[^>]+>/g, ""),
    innerHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    cta ? `${cta.label}: ${cta.href}` : "",
    "",
    "Team ShipAmaze",
    brand.supportEmail ? `Support: ${brand.supportEmail}` : "",
    brand.websiteUrl || "",
  ].filter(Boolean);

  return { html, text: textParts.join("\n") };
}

export function templateEmailVerificationOtp(params: {
  name: string;
  otp: string;
  expiresMinutes: number;
}): { subject: string; html: string; text: string } {
  const brand = getBrandEmailConfig();
  const inner = `
    <p style="margin:0 0 12px;">Use this one-time code to verify your email address:</p>
    <div style="text-align:center;margin:20px 0;">
      <div style="display:inline-block;padding:16px 32px;border-radius:10px;background:#eff6ff;border:2px dashed ${brand.primaryColor};font-size:28px;font-weight:700;letter-spacing:0.25em;color:#1e3a8a;">${escapeHtml(params.otp)}</div>
    </div>
    <p style="margin:0;font-size:14px;color:#475569;">This code expires in <strong>${params.expiresMinutes} minutes</strong>.</p>
    <p style="margin:12px 0 0;font-size:13px;color:#64748b;">Never share this code with anyone. ShipAmaze staff will never ask for your OTP.</p>`;
  const { html, text } = wrapLayout({
    brand,
    title: "Email verification",
    badge: { label: "Verify email", tone: "info" },
    greeting: `Hi ${escapeHtml(params.name)},`,
    innerHtml: inner,
    footerNote: "If you did not create an account, you can ignore this email.",
  });
  return { subject: "Verify your ShipAmaze email", html, text: text + `\n\nCode: ${params.otp}\nExpires in ${params.expiresMinutes} minutes.` };
}

export function templateWelcome(params: { name: string; role: string; dashboardUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = getBrandEmailConfig();
  const inner = `
    <p style="margin:0 0 12px;">Your email is verified and your <strong>${escapeHtml(roleLabel(params.role))}</strong> account is ready.</p>
    <p style="margin:0 0 12px;">Here are a few quick wins to get started:</p>
    <ol style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.7;">
      <li>Complete your profile</li>
      <li>Add a pickup address</li>
      <li>Create your first order</li>
      <li>Connect Shopify if you sell online</li>
    </ol>`;
  const { html, text } = wrapLayout({
    brand,
    title: "Welcome aboard",
    badge: { label: "Account active", tone: "success" },
    greeting: `Hi ${escapeHtml(params.name)}, welcome to ShipAmaze!`,
    innerHtml: inner,
    cta: { href: params.dashboardUrl, label: "Go to Dashboard" },
  });
  return { subject: "Welcome to ShipAmaze", html, text };
}

export function templatePasswordResetOtp(params: { otp: string; expiresMinutes: number }): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = getBrandEmailConfig();
  const inner = `
    <p style="margin:0 0 12px;">We received a request to reset your password.</p>
    <div style="text-align:center;margin:20px 0;">
      <div style="display:inline-block;padding:16px 32px;border-radius:10px;background:#fef2f2;border:2px dashed #dc2626;font-size:28px;font-weight:700;letter-spacing:0.25em;color:#991b1b;">${escapeHtml(params.otp)}</div>
    </div>
    <p style="margin:0;font-size:14px;color:#475569;">This code expires in <strong>${params.expiresMinutes} minutes</strong>.</p>
    <p style="margin:12px 0 0;font-size:13px;color:#64748b;">If you did not request a reset, ignore this email — your password will stay the same.</p>`;
  const { html, text } = wrapLayout({
    brand,
    title: "Password reset",
    badge: { label: "Security", tone: "warning" },
    greeting: "Hello,",
    innerHtml: inner,
  });
  return { subject: "Reset your ShipAmaze password", html, text: text + `\n\nCode: ${params.otp}` };
}

export function templateOrderCreated(params: {
  name: string;
  orderId: string;
  customer: string;
  payment: string;
  amount: number;
  status: string;
  productSummary: string;
  viewUrl: string;
}): { subject: string; html: string; text: string } {
  const brand = getBrandEmailConfig();
  const inner = `
    <table role="presentation" width="100%" style="font-size:14px;color:#334155;">
      <tr><td style="padding:4px 0;"><strong>Order ID</strong></td><td>${escapeHtml(params.orderId)}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Customer</strong></td><td>${escapeHtml(params.customer)}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Payment</strong></td><td>${escapeHtml(params.payment)}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Amount</strong></td><td>₹${escapeHtml(String(params.amount))}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Status</strong></td><td>${escapeHtml(params.status)}</td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:13px;color:#64748b;"><strong>Products:</strong> ${escapeHtml(params.productSummary)}</p>`;
  const { html, text } = wrapLayout({
    brand,
    title: "Order created",
    badge: { label: params.status, tone: "success" },
    greeting: `Hi ${escapeHtml(params.name)},`,
    innerHtml: inner,
    cta: { href: params.viewUrl, label: "View order" },
  });
  return { subject: `Order created successfully — ${params.orderId}`, html, text };
}

export function templateOrderTracking(params: {
  name: string;
  orderId: string;
  awb: string;
  courier: string;
  previousStatus: string;
  newStatus: string;
  newStatusLabel: string;
  trackUrl: string;
}): { subject: string; html: string; text: string } {
  const brand = getBrandEmailConfig();
  const inner = `
    <table role="presentation" width="100%" style="font-size:14px;color:#334155;">
      <tr><td style="padding:4px 0;"><strong>Order</strong></td><td>${escapeHtml(params.orderId)}</td></tr>
      <tr><td style="padding:4px 0;"><strong>AWB / Tracking</strong></td><td>${escapeHtml(params.awb || "—")}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Courier</strong></td><td>${escapeHtml(params.courier || "—")}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Previous</strong></td><td>${escapeHtml(params.previousStatus)}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Now</strong></td><td>${escapeHtml(params.newStatusLabel)}</td></tr>
    </table>`;
  const { html, text } = wrapLayout({
    brand,
    title: "Tracking update",
    badge: { label: params.newStatusLabel, tone: "info" },
    greeting: `Hi ${escapeHtml(params.name)},`,
    innerHtml: inner,
    cta: { href: params.trackUrl, label: "Track shipment" },
  });
  return {
    subject: `Tracking update for order ${params.orderId} — ${params.newStatusLabel}`,
    html,
    text,
  };
}

export function templateShipmentCreated(params: {
  name: string;
  orderId: string;
  awb: string;
  courier: string;
  trackingUrl: string;
  labelUrl?: string;
  walletDeduction?: number;
}): { subject: string; html: string; text: string } {
  const brand = getBrandEmailConfig();
  const walletLine =
    params.walletDeduction != null && params.walletDeduction > 0
      ? `<p style="margin:12px 0 0;font-size:14px;color:#b45309;"><strong>Wallet:</strong> ₹${escapeHtml(String(params.walletDeduction))} debited for shipping.</p>`
      : "";
  const inner = `
    <table role="presentation" width="100%" style="font-size:14px;color:#334155;">
      <tr><td style="padding:4px 0;"><strong>Order ID</strong></td><td>${escapeHtml(params.orderId)}</td></tr>
      <tr><td style="padding:4px 0;"><strong>AWB</strong></td><td>${escapeHtml(params.awb)}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Courier</strong></td><td>${escapeHtml(params.courier)}</td></tr>
    </table>
    ${params.labelUrl ? `<p style="margin:12px 0 0;"><a href="${escapeHtml(params.labelUrl)}" style="color:${brand.primaryColor};">Download label</a></p>` : ""}
    ${walletLine}`;
  const { html, text } = wrapLayout({
    brand,
    title: "Shipment created",
    badge: { label: "AWB issued", tone: "success" },
    greeting: `Hi ${escapeHtml(params.name)},`,
    innerHtml: inner,
    cta: { href: params.trackingUrl, label: "Track shipment" },
  });
  const ref = params.awb || params.orderId;
  return { subject: `Shipment created — AWB ${ref}`, html, text };
}

export function templateWallet(params: {
  name: string;
  credit: boolean;
  amount: number;
  balanceAfter: number;
  reason: string;
  reference: string;
  atIso: string;
}): { subject: string; html: string; text: string } {
  const brand = getBrandEmailConfig();
  const amt = params.amount.toFixed(2);
  const badge = params.credit ? "Credit" : "Debit";
  const tone = params.credit ? ("success" as const) : ("warning" as const);
  const inner = `
    <table role="presentation" width="100%" style="font-size:14px;color:#334155;">
      <tr><td style="padding:4px 0;"><strong>Type</strong></td><td>${badge}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Amount</strong></td><td>₹${escapeHtml(amt)}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Balance after</strong></td><td>₹${escapeHtml(params.balanceAfter.toFixed(2))}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Reference</strong></td><td>${escapeHtml(params.reference)}</td></tr>
      <tr><td style="padding:4px 0;"><strong>When</strong></td><td>${escapeHtml(params.atIso)}</td></tr>
    </table>
    <p style="margin:12px 0 0;font-size:14px;">${escapeHtml(params.reason)}</p>`;
  const { html, text } = wrapLayout({
    brand,
    title: "Wallet activity",
    badge: { label: params.credit ? "Credited" : "Debited", tone },
    greeting: `Hi ${escapeHtml(params.name)},`,
    innerHtml: inner,
  });
  const subject = params.credit ? `Wallet credited — ₹${amt}` : `Wallet debited — ₹${amt}`;
  return { subject, html, text };
}

export function templateShopifySync(params: {
  name: string;
  shopDomain: string;
  synced: number;
  inserted: number;
  updated: number;
  skipped: number;
  ordersUrl: string;
}): { subject: string; html: string; text: string } {
  const brand = getBrandEmailConfig();
  const inner = `
    <p style="margin:0 0 12px;">Your Shopify store <strong>${escapeHtml(params.shopDomain)}</strong> finished syncing.</p>
    <table role="presentation" width="100%" style="font-size:14px;color:#334155;">
      <tr><td style="padding:4px 0;"><strong>Processed</strong></td><td>${params.synced}</td></tr>
      <tr><td style="padding:4px 0;"><strong>New orders</strong></td><td>${params.inserted}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Updated</strong></td><td>${params.updated}</td></tr>
      <tr><td style="padding:4px 0;"><strong>Skipped</strong></td><td>${params.skipped}</td></tr>
    </table>`;
  const { html, text } = wrapLayout({
    brand,
    title: "Shopify sync",
    badge: { label: "Channels", tone: "info" },
    greeting: `Hi ${escapeHtml(params.name)},`,
    innerHtml: inner,
    cta: { href: params.ordersUrl, label: "View orders" },
  });
  return { subject: `Shopify sync complete — ${params.shopDomain}`, html, text };
}

export function templateSecurityNotice(params: {
  name: string;
  headline: string;
  body: string;
  atIso: string;
}): { subject: string; html: string; text: string } {
  const brand = getBrandEmailConfig();
  const inner = `<p style="margin:0 0 8px;">${escapeHtml(params.body)}</p>
    <p style="margin:0;font-size:13px;color:#64748b;"><strong>Time:</strong> ${escapeHtml(params.atIso)}</p>
    <p style="margin:12px 0 0;font-size:13px;color:#64748b;">If this was not you, contact support immediately.</p>`;
  const { html, text } = wrapLayout({
    brand,
    title: "Security notice",
    badge: { label: "Account", tone: "warning" },
    greeting: `Hi ${escapeHtml(params.name)},`,
    innerHtml: inner,
  });
  return { subject: params.headline, html, text };
}
