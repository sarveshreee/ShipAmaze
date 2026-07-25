import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const jsonMessage = { success: false, message: "Too many requests. Please try again later." };

/** Login / register — per IP, shared NAT may hit limit; tune via env if needed. */
export const authRouteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});

/** Forgot-password + OTP reset — stricter. */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PASSWORD_RESET_MAX ?? 12),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});

/** Shopify OAuth callback (unauthenticated browser redirect). */
export const shopifyCallbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SHOPIFY_CALLBACK_MAX ?? 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});

/** Shopify connect initiation (authenticated). */
export const shopifyConnectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SHOPIFY_CONNECT_MAX ?? 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});

/** Email verification OTP verify (per IP). */
export const emailOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_EMAIL_OTP_VERIFY_MAX ?? 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});

/** Send / resend signup verification OTP (per IP). */
export const emailOtpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_EMAIL_OTP_SEND_MAX ?? process.env.RATE_LIMIT_EMAIL_OTP_RESEND_MAX ?? 8),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});

/** Resend signup verification OTP (per IP). */
export const emailOtpResendLimiter = emailOtpSendLimiter;

/** Public AWB / order tracking. */
export const publicTrackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PUBLIC_TRACK_MAX ?? 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});

/**
 * Courier booking — prevents double-click / retry storms on POST /api/courier/shipments.
 * Keyed by user id when authenticated, else IP. Emits standard RateLimit-* + Retry-After.
 */
export const courierBookingLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_COURIER_BOOKING_WINDOW_MS ?? 60_000),
  max: Number(process.env.RATE_LIMIT_COURIER_BOOKING_MAX ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many booking requests. Please wait and try again.",
    code: "BOOKING_RATE_LIMITED",
    retryable: true,
  },
  keyGenerator: (req) => {
    const userId = (req as { user?: { _id?: unknown } }).user?._id;
    if (userId != null) return `booking:user:${String(userId)}`;
    return `booking:ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
  },
});
