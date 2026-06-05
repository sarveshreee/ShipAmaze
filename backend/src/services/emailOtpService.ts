import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { EmailVerificationOtp } from "../models/EmailVerificationOtp.js";
import { User } from "../models/User.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { safeErrorMessage } from "../utils/logRedact.js";

/** OTP validity window (minutes). `OTP_EXPIRY_MINUTES` takes precedence over legacy `EMAIL_VERIFICATION_OTP_MINUTES`. */
export const OTP_EXPIRY_MINUTES = Math.min(
  60,
  Math.max(1, Number(process.env.OTP_EXPIRY_MINUTES ?? process.env.EMAIL_VERIFICATION_OTP_MINUTES ?? 5) || 5)
);

export const OTP_MAX_ATTEMPTS = Math.min(
  20,
  Math.max(3, Number(process.env.EMAIL_VERIFICATION_MAX_ATTEMPTS ?? 5) || 5)
);

export const OTP_RESEND_COOLDOWN_SECONDS = Math.min(
  300,
  Math.max(30, Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60) || 60)
);

/** Generate a cryptographically secure 6-digit OTP. */
export function generateSecureOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

function otpExpiresAt(): Date {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp.trim(), 10);
}

export async function storeEmailVerificationOtp(email: string, otpHash: string, lastSentAt = new Date()): Promise<void> {
  await EmailVerificationOtp.findOneAndUpdate(
    { email },
    { $set: { otpHash, expiresAt: otpExpiresAt(), attempts: 0, lastSentAt } },
    { upsert: true }
  );
}

async function sendOtpEmail(email: string, name: string, code: string): Promise<void> {
  const { sendSignupVerificationOtp } = await import("./email/emailService.js");
  await sendSignupVerificationOtp(email, name, code, OTP_EXPIRY_MINUTES);
}

function assertResendCooldown(record: { lastSentAt?: Date } | null): void {
  if (!record?.lastSentAt) return;
  const elapsedMs = Date.now() - record.lastSentAt.getTime();
  const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
  if (elapsedMs < cooldownMs) {
    const waitSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
    throw new AppError(429, `Please wait ${waitSec} seconds before requesting a new code.`);
  }
}

/** Issue and email a new verification OTP for an unverified account. */
export async function issueAndSendEmailVerificationOtp(email: string, name: string): Promise<void> {
  const code = generateSecureOtp();
  const otpHash = await hashOtp(code);
  const now = new Date();
  await storeEmailVerificationOtp(email, otpHash, now);
  try {
    await sendOtpEmail(email, name, code);
  } catch (err) {
    console.error("[emailOtp] Failed to send verification email:", safeErrorMessage(err));
    throw new AppError(502, "Could not send verification code right now. Please try again in a moment.");
  }
}

/**
 * Send OTP to an unverified account (anti-enumeration: same response whether or not account exists).
 * Enforces resend cooldown when a prior OTP record exists.
 */
export async function sendOtpToEmail(email: string, options?: { enforceCooldown?: boolean }): Promise<void> {
  const user = await User.findOne({ email });
  if (!user || user.emailVerified !== false) return;

  if (options?.enforceCooldown) {
    const existing = await EmailVerificationOtp.findOne({ email }).select("lastSentAt").lean();
    assertResendCooldown(existing);
  }

  await issueAndSendEmailVerificationOtp(email, user.name);
}

/** Resend OTP with cooldown enforcement. */
export async function resendOtpToEmail(email: string): Promise<void> {
  const user = await User.findOne({ email });
  if (!user || user.emailVerified !== false) return;

  const existing = await EmailVerificationOtp.findOne({ email }).select("lastSentAt").lean();
  assertResendCooldown(existing);
  await issueAndSendEmailVerificationOtp(email, user.name);
}

export type VerifyOtpResult = { user: InstanceType<typeof User> };

/** Verify OTP, mark email verified, and delete OTP record. */
export async function verifyEmailOtpCode(email: string, otp: string): Promise<VerifyOtpResult> {
  const user = await User.findOne({ email });
  if (!user) throw new AppError(400, "Invalid or expired code");
  if (user.emailVerified !== false) {
    throw new AppError(400, "Email is already verified");
  }

  const record = await EmailVerificationOtp.findOne({ email });
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, "Invalid or expired code");
  }
  if ((record.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    throw new AppError(429, "Too many attempts. Please request a new code.");
  }

  const otpOk = await bcrypt.compare(otp.trim(), record.otpHash);
  if (!otpOk) {
    await EmailVerificationOtp.updateOne({ email }, { $inc: { attempts: 1 } });
    throw new AppError(400, "Invalid or expired code");
  }

  user.emailVerified = true;
  await user.save();
  await EmailVerificationOtp.deleteMany({ email });

  return { user };
}
