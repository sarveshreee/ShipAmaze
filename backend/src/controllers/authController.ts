import type { Request, Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { User } from "../models/User.js";
import { PasswordResetOtp } from "../models/PasswordResetOtp.js";
import { EmailVerificationOtp } from "../models/EmailVerificationOtp.js";
import { sendPasswordResetOtp } from "../services/mail.js";
import { Profile } from "../models/Profile.js";
import { Vendor } from "../models/Vendor.js";
import { Dropshipper } from "../models/Dropshipper.js";
import { Wallet } from "../models/Wallet.js";
import { signToken } from "../utils/jwt.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { safeErrorMessage } from "../utils/logRedact.js";

const EMAIL_OTP_MINUTES = Math.min(60, Math.max(5, Number(process.env.EMAIL_VERIFICATION_OTP_MINUTES ?? 10) || 10));
const EMAIL_OTP_MAX_ATTEMPTS = Math.min(20, Math.max(3, Number(process.env.EMAIL_VERIFICATION_MAX_ATTEMPTS ?? 5) || 5));
const PASSWORD_RESET_MAX_ATTEMPTS = Math.min(20, Math.max(3, Number(process.env.PASSWORD_RESET_MAX_ATTEMPTS ?? 8) || 8));

function isEmailVerifiedForLogin(user: { emailVerified?: boolean }): boolean {
  return user.emailVerified !== false;
}

/** Roles allowed on the public signup endpoint (admin is seed / internal only). */
export const PUBLIC_REGISTER_ROLES = ["vendor", "dropshipper"] as const;
export type PublicRegisterRole = (typeof PUBLIC_REGISTER_ROLES)[number];

const registerSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(PUBLIC_REGISTER_ROLES),
  companyName: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

async function toPublicUser(user: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  companyName: string;
  phone?: string;
  emailVerified?: boolean;
}) {
  const profile = await Profile.findOne({ userId: user._id }).lean();
  let dropshipperAccessType: "FULL" | "RESTRICTED" | undefined;
  let allowWarehouseAccess: boolean | undefined;
  if (user.role === "dropshipper") {
    const { Dropshipper } = await import("../models/Dropshipper.js");
    const d = await Dropshipper.findOne({ userId: user._id }).select("accessType allowWarehouseAccess").lean();
    dropshipperAccessType = d?.accessType === "RESTRICTED" ? "RESTRICTED" : "FULL";
    allowWarehouseAccess =
      typeof d?.allowWarehouseAccess === "boolean" ? d.allowWarehouseAccess : dropshipperAccessType !== "RESTRICTED";
  }
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    companyName: user.companyName,
    phone: user.phone ?? "",
    emailVerified: user.emailVerified !== false,
    address: profile?.address ?? "",
    avatarUrl:
      profile?.avatarUrl && String(profile.avatarUrl).trim() ? String(profile.avatarUrl).trim() : null,
    dropshipperAccessType,
    allowWarehouseAccess,
  };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const rawRole = (req.body as { role?: unknown })?.role;
  if (rawRole === "admin" || rawRole === "Admin") {
    throw new AppError(403, "Admin accounts cannot be created via public registration");
  }

  const body = registerSchema.parse(req.body);
  const exists = await User.findOne({ email: body.email });
  if (exists) throw new AppError(409, "This email is already registered");

  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await User.create({
    name: body.name,
    email: body.email,
    passwordHash,
    role: body.role,
    companyName: body.companyName ?? "",
    phone: body.phone ?? "",
    permissions: [],
    emailVerified: false,
  });

  await Profile.create({ userId: user._id });
  await Wallet.create({ userId: user._id, balance: 0 });

  if (body.role === "vendor") {
    await Vendor.create({
      userId: user._id,
      name: body.companyName || body.name,
      city: "",
      pin: "",
      assignedVendors: 0,
      ordersToday: 0,
      status: "Active",
    });
  } else if (body.role === "dropshipper") {
    await Dropshipper.create({
      userId: user._id,
      totalOrders: 0,
      activeOrders: 0,
      kycVerified: false,
      joinDate: new Date(),
    });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const otpHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + EMAIL_OTP_MINUTES * 60 * 1000);
  await EmailVerificationOtp.findOneAndUpdate(
    { email: user.email },
    { $set: { otpHash, expiresAt, attempts: 0 } },
    { upsert: true }
  );
  try {
    const { sendSignupVerificationOtp } = await import("../services/email/emailService.js");
    await sendSignupVerificationOtp(user.email, user.name, code, EMAIL_OTP_MINUTES);
  } catch (err) {
    console.error("[auth] Failed to send verification email:", safeErrorMessage(err));
    throw new AppError(
      502,
      "Account created, but OTP email could not be delivered. Please use Resend code after checking email settings."
    );
  }

  const publicUser = await toPublicUser(user);
  res.status(201).json({
    needsEmailVerification: true,
    message: "Please verify your email. We sent a 6-digit code to your inbox.",
    user: publicUser,
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const user = await User.findOne({ email: body.email });
  if (!user) throw new AppError(401, "No account found for this email");

  if (user.status === "blocked") throw new AppError(403, "Your account has been blocked");
  if (user.status === "inactive") throw new AppError(403, "Your account is inactive");

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) throw new AppError(401, "Incorrect password");

  if (!isEmailVerifiedForLogin(user)) {
    throw new AppError(403, "Please verify your email before logging in.");
  }

  const token = signToken({ sub: String(user._id), role: user.role });
  const publicUser = await toPublicUser(user);
  res.json({ user: publicUser, token });
});

export const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  res.json({ user: await toPublicUser(req.user) });
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional(),
  companyName: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  avatarUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.body && typeof req.body === "object") {
    if ("email" in req.body || "role" in req.body) {
      throw new AppError(400, "Cannot update email or role");
    }
  }
  const body = profileUpdateSchema.parse(req.body ?? {});
  if (body.name !== undefined) req.user.name = body.name.trim();
  if (body.phone !== undefined) req.user.phone = body.phone.trim();
  if (body.companyName !== undefined) req.user.companyName = body.companyName.trim();
  await req.user.save();

  try {
    const { sendSecurityEmail } = await import("../services/email/emailService.js");
    await sendSecurityEmail(req.user._id, "profile_updated");
  } catch (err) {
    console.error("[auth] profile security email:", safeErrorMessage(err));
  }

  if (body.address !== undefined || body.avatarUrl !== undefined) {
    const $set: Record<string, string> = {};
    const $unset: Record<string, 1> = {};
    if (body.address !== undefined) $set.address = body.address.trim();
    if (body.avatarUrl !== undefined) {
      if (body.avatarUrl === null || body.avatarUrl === "") $unset.avatarUrl = 1;
      else $set.avatarUrl = body.avatarUrl;
    }
    await Profile.findOneAndUpdate(
      { userId: req.user._id },
      { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
      { upsert: true, new: true }
    );
  }

  res.json({ user: await toPublicUser(req.user) });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ ok: true });
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New password and confirmation do not match",
        path: ["confirmPassword"],
      });
    }
  });

export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = changePasswordSchema.parse(req.body);
  const ok = await bcrypt.compare(body.currentPassword, req.user.passwordHash);
  if (!ok) throw new AppError(400, "Current password is incorrect");
  req.user.passwordHash = await bcrypt.hash(body.newPassword, 10);
  await req.user.save();
  try {
    const { sendSecurityEmail } = await import("../services/email/emailService.js");
    await sendSecurityEmail(req.user._id, "password_changed");
  } catch (err) {
    console.error("[auth] password-changed email:", safeErrorMessage(err));
  }
  res.json({ ok: true });
});

const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
});

/** Request a one-time code by email (always same response to avoid email enumeration). */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = forgotPasswordSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const user = await User.findOne({ email });
  if (user && user.status !== "blocked") {
    const code = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await PasswordResetOtp.findOneAndUpdate(
      { email },
      { $set: { otpHash, expiresAt, attempts: 0 } },
      { upsert: true }
    );
    try {
      await sendPasswordResetOtp(email, code);
    } catch (err) {
      console.warn("[email] Failed to send password reset email:", safeErrorMessage(err));
    }
  }
  res.json({ ok: true, message: "If an account exists for this email, a reset code has been sent." });
});

const resetPasswordSchema = z
  .object({
    email: z.string().min(1, "Email is required").email("Invalid email address"),
    otp: z.string().min(6, "Enter the 6-digit code").max(6, "Enter the 6-digit code"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New password and confirmation do not match",
        path: ["confirmPassword"],
      });
    }
  });

export const resetPasswordWithOtp = asyncHandler(async (req: Request, res: Response) => {
  const body = resetPasswordSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user) throw new AppError(400, "Invalid or expired code");
  if (user.status === "blocked") throw new AppError(403, "Your account has been blocked");

  const record = await PasswordResetOtp.findOne({ email });
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, "Invalid or expired code");
  }
  const attempts = record.attempts ?? 0;
  if (attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
    throw new AppError(429, "Too many attempts. Please request a new reset code.");
  }
  const otpOk = await bcrypt.compare(body.otp.trim(), record.otpHash);
  if (!otpOk) {
    await PasswordResetOtp.updateOne({ email }, { $inc: { attempts: 1 } });
    throw new AppError(400, "Invalid or expired code");
  }

  user.passwordHash = await bcrypt.hash(body.newPassword, 10);
  await user.save();
  await PasswordResetOtp.deleteMany({ email });
  res.json({ ok: true });
});

const verifyEmailOtpSchema = z.object({
  email: z.string().min(1).email(),
  otp: z.string().min(6).max(6),
});

export const verifyEmailOtp = asyncHandler(async (req: Request, res: Response) => {
  const body = verifyEmailOtpSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user) throw new AppError(400, "Invalid or expired code");
  if (user.emailVerified !== false) {
    throw new AppError(400, "Email is already verified");
  }

  const record = await EmailVerificationOtp.findOne({ email });
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, "Invalid or expired code");
  }
  if ((record.attempts ?? 0) >= EMAIL_OTP_MAX_ATTEMPTS) {
    throw new AppError(429, "Too many attempts. Please request a new code.");
  }

  const otpOk = await bcrypt.compare(body.otp.trim(), record.otpHash);
  if (!otpOk) {
    await EmailVerificationOtp.updateOne({ email }, { $inc: { attempts: 1 } });
    throw new AppError(400, "Invalid or expired code");
  }

  user.emailVerified = true;
  await user.save();
  await EmailVerificationOtp.deleteMany({ email });

  try {
    const { sendWelcomeEmail, sendSecurityEmail } = await import("../services/email/emailService.js");
    await sendWelcomeEmail(user.email, user.name, user.role);
    await sendSecurityEmail(user._id, "email_verified");
  } catch (err) {
    console.error("[auth] welcome/security email:", safeErrorMessage(err));
  }

  const token = signToken({ sub: String(user._id), role: user.role });
  const publicUser = await toPublicUser(user);
  res.json({ user: publicUser, token });
});

const resendEmailOtpSchema = z.object({
  email: z.string().min(1).email(),
});

export const resendEmailVerificationOtp = asyncHandler(async (req: Request, res: Response) => {
  const body = resendEmailOtpSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const user = await User.findOne({ email });
  if (user && user.emailVerified === false) {
    const code = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + EMAIL_OTP_MINUTES * 60 * 1000);
    await EmailVerificationOtp.findOneAndUpdate(
      { email },
      { $set: { otpHash, expiresAt, attempts: 0 } },
      { upsert: true }
    );
    try {
      const { sendSignupVerificationOtp } = await import("../services/email/emailService.js");
      await sendSignupVerificationOtp(email, user.name, code, EMAIL_OTP_MINUTES);
    } catch (err) {
      console.error("[auth] resend verification email:", safeErrorMessage(err));
      throw new AppError(502, "Could not send verification code right now. Please try again in a moment.");
    }
  }
  res.json({ ok: true, message: "If this account exists and is awaiting verification, a new code has been sent." });
});
