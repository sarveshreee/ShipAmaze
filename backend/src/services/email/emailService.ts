import mongoose from "mongoose";
import {
  templateEmailVerificationOtp,
  templateWelcome,
  templatePasswordResetOtp,
  templateOrderCreated,
  templateOrderTracking,
  templateShipmentCreated,
  templateWallet,
  templateShopifySync,
  templateSecurityNotice,
} from "./emailTemplates.js";
import { User } from "../../models/User.js";
import { envTrim, sendMailWithSmtp } from "./emailClient.js";
import { safeErrorMessage } from "../../utils/logRedact.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";
import type { UserRole } from "../../models/User.js";

function dashboardPathForRole(role: string): string {
  const r = role.toLowerCase();
  if (r === "admin") return "/admin/dashboard";
  if (r === "vendor") return "/vendor/dashboard";
  return "/dropshipper/dashboard";
}

export function buildFrontendUrl(path: string): string {
  const base = envTrim("FRONTEND_URL") || envTrim("BRAND_WEBSITE_URL") || envTrim("CORS_ORIGIN")?.split(",")[0]?.trim() || "http://localhost:8080";
  const u = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${u}${p}`;
}

function statusLabel(canonical: string): string {
  const map: Record<string, string> = {
    ready_to_ship: "Ready to ship",
    pickup_scheduled: "Pickup scheduled",
    picked_up: "Picked up",
    in_transit: "In transit",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    ndr: "NDR",
    rto: "RTO",
    cancelled: "Cancelled",
    draft: "Draft",
  };
  return map[canonical] || canonical.replace(/_/g, " ");
}

async function loadUserEmailName(userId: mongoose.Types.ObjectId): Promise<{ email: string; name: string; role: string } | null> {
  const u = await User.findById(userId).select("email name role").lean();
  if (!u?.email) return null;
  return { email: u.email, name: u.name || "there", role: u.role || "vendor" };
}

/** Fire-and-forget safe mail: never throws to callers. */
export async function safeSend(to: string, subject: string, html: string, text: string): Promise<void> {
  try {
    await sendMailWithSmtp({ to, subject, html, text });
  } catch (e: unknown) {
    console.error("[email] safeSend error:", safeErrorMessage(e));
  }
}

export async function sendSignupVerificationOtp(to: string, name: string, otp: string, expiresMinutes: number): Promise<void> {
  const { subject, html, text } = templateEmailVerificationOtp({ name, otp, expiresMinutes });
  await safeSend(to, subject, html, text);
}

export async function sendWelcomeEmail(to: string, name: string, role: UserRole): Promise<void> {
  const url = buildFrontendUrl(dashboardPathForRole(role));
  const { subject, html, text } = templateWelcome({ name, role, dashboardUrl: url });
  await safeSend(to, subject, html, text);
}

export async function sendPasswordResetBranded(to: string, otp: string, expiresMinutes: number): Promise<void> {
  const { subject, html, text } = templatePasswordResetOtp({ otp, expiresMinutes });
  await safeSend(to, subject, html, text);
}

export async function sendOrderCreatedEmail(order: {
  orderId: string;
  customer: string;
  payment: string;
  amount: number;
  status: string;
  products?: unknown[];
  items?: unknown[];
  ownerUserId?: mongoose.Types.ObjectId;
  dropshipperId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
}): Promise<void> {
  const uid = (order.ownerUserId ?? order.dropshipperId ?? order.createdBy) as mongoose.Types.ObjectId | undefined;
  if (!uid) return;
  const u = await loadUserEmailName(uid);
  if (!u) return;
  const items = (order.items ?? order.products ?? []) as { name?: string; title?: string }[];
  const productSummary = items
    .slice(0, 4)
    .map((i) => String(i.name ?? i.title ?? "Item").trim())
    .filter(Boolean)
    .join(", ");
  const summary = productSummary || "—";
  const pathOrders =
    u.role === "admin" ? "/admin/orders" : u.role === "vendor" ? "/vendor/orders" : "/dropshipper/orders";
  const { subject, html, text } = templateOrderCreated({
    name: u.name,
    orderId: order.orderId,
    customer: order.customer,
    payment: order.payment,
    amount: order.amount,
    status: order.status,
    productSummary: summary,
    viewUrl: buildFrontendUrl(pathOrders),
  });
  await safeSend(u.email, subject, html, text);
}

const TRACKING_NOTIFY = new Set([
  "ready_to_ship",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ndr",
  "rto",
  "cancelled",
]);

export async function sendOrderTrackingEmail(params: {
  order: {
    orderId: string;
    awb?: string;
    trackingId?: string;
    courier?: string;
    courierName?: string;
    status: string;
    ownerUserId?: mongoose.Types.ObjectId;
    dropshipperId?: mongoose.Types.ObjectId;
    createdBy?: mongoose.Types.ObjectId;
  };
  previousStatusRaw: string;
}): Promise<void> {
  const prev = normalizeOrderStatus(params.previousStatusRaw);
  const next = normalizeOrderStatus(params.order.status);
  if (prev === next) return;
  if (!TRACKING_NOTIFY.has(next)) return;

  const uid = (params.order.ownerUserId ??
    params.order.dropshipperId ??
    params.order.createdBy) as mongoose.Types.ObjectId | undefined;
  if (!uid) return;
  const u = await loadUserEmailName(uid);
  if (!u) return;

  const awb = String(params.order.awb || params.order.trackingId || "").trim();
  const courier = String(params.order.courierName || params.order.courier || "");
  const trackPath = awb ? `/track?awb=${encodeURIComponent(awb)}` : `/order-detail?orderId=${encodeURIComponent(params.order.orderId)}`;
  const { subject, html, text } = templateOrderTracking({
    name: u.name,
    orderId: params.order.orderId,
    awb,
    courier,
    previousStatus: statusLabel(prev),
    newStatus: next,
    newStatusLabel: statusLabel(next),
    trackUrl: buildFrontendUrl(trackPath),
  });
  await safeSend(u.email, subject, html, text);
}

export async function sendShipmentCreatedEmail(params: {
  order: {
    orderId: string;
    awb?: string;
    trackingId?: string;
    courier?: string;
    courierName?: string;
    labelUrl?: string;
    trackingUrl?: string;
    ownerUserId?: mongoose.Types.ObjectId;
    dropshipperId?: mongoose.Types.ObjectId;
    createdBy?: mongoose.Types.ObjectId;
  };
  walletDeduction?: number;
}): Promise<void> {
  const awb = String(params.order.awb || params.order.trackingId || "").trim();
  if (!awb) return;

  const uid = (params.order.ownerUserId ??
    params.order.dropshipperId ??
    params.order.createdBy) as mongoose.Types.ObjectId | undefined;
  if (!uid) return;
  const u = await loadUserEmailName(uid);
  if (!u) return;

  const courier = String(params.order.courierName || params.order.courier || "Courier");
  const trackUrl =
    params.order.trackingUrl?.trim() ||
    buildFrontendUrl(`/track?awb=${encodeURIComponent(awb)}`);

  const { subject, html, text } = templateShipmentCreated({
    name: u.name,
    orderId: params.order.orderId,
    awb,
    courier,
    trackingUrl: trackUrl,
    labelUrl: params.order.labelUrl,
    walletDeduction: params.walletDeduction,
  });
  await safeSend(u.email, subject, html, text);
}

export async function sendWalletTxnEmail(params: {
  userId: mongoose.Types.ObjectId;
  credit: boolean;
  amount: number;
  balanceAfter: number;
  reason: string;
  reference: string;
}): Promise<void> {
  const u = await loadUserEmailName(params.userId);
  if (!u) return;
  const { subject, html, text } = templateWallet({
    name: u.name,
    credit: params.credit,
    amount: params.amount,
    balanceAfter: params.balanceAfter,
    reason: params.reason,
    reference: params.reference,
    atIso: new Date().toISOString(),
  });
  await safeSend(u.email, subject, html, text);
}

export async function sendShopifySyncEmail(params: {
  userId: mongoose.Types.ObjectId;
  shopDomain: string;
  synced: number;
  inserted: number;
  updated: number;
  skipped: number;
}): Promise<void> {
  const u = await loadUserEmailName(params.userId);
  if (!u) return;
  const pathOrders = u.role === "dropshipper" ? "/dropshipper/orders" : u.role === "vendor" ? "/vendor/orders" : "/admin/orders";
  const { subject, html, text } = templateShopifySync({
    name: u.name,
    shopDomain: params.shopDomain,
    synced: params.synced,
    inserted: params.inserted,
    updated: params.updated,
    skipped: params.skipped,
    ordersUrl: buildFrontendUrl(pathOrders),
  });
  await safeSend(u.email, subject, html, text);
}

export async function sendSecurityEmail(
  userId: mongoose.Types.ObjectId,
  kind: "password_changed" | "email_verified" | "profile_updated"
): Promise<void> {
  const u = await loadUserEmailName(userId);
  if (!u) return;
  const atIso = new Date().toISOString();
  const map = {
    password_changed: {
      headline: "Your ShipAmaze password was changed",
      body: "The password for your account was just updated.",
    },
    email_verified: {
      headline: "Your email was verified",
      body: "Your ShipAmaze account email address has been successfully verified.",
    },
    profile_updated: {
      headline: "Your profile was updated",
      body: "Your account profile details were updated.",
    },
  }[kind];
  const { subject, html, text } = templateSecurityNotice({
    name: u.name,
    headline: map.headline,
    body: map.body,
    atIso,
  });
  await safeSend(u.email, subject, html, text);
}
