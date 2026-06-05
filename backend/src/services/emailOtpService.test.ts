import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import {
  generateSecureOtp,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  verifyEmailOtpCode,
} from "./emailOtpService.js";

vi.mock("../models/User.js", () => ({
  User: {
    findOne: vi.fn(),
  },
}));

vi.mock("../models/EmailVerificationOtp.js", () => ({
  EmailVerificationOtp: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

import { User } from "../models/User.js";
import { EmailVerificationOtp } from "../models/EmailVerificationOtp.js";

describe("emailOtpService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports OTP config with sane defaults", () => {
    expect(OTP_EXPIRY_MINUTES).toBeGreaterThanOrEqual(1);
    expect(OTP_MAX_ATTEMPTS).toBeGreaterThanOrEqual(3);
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it("generateSecureOtp returns 6-digit string", () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateSecureOtp();
      expect(otp).toMatch(/^\d{6}$/);
      expect(Number(otp)).toBeGreaterThanOrEqual(100000);
      expect(Number(otp)).toBeLessThan(1000000);
    }
  });

  it("verifyEmailOtpCode rejects invalid OTP and increments attempts", async () => {
    const email = "user@example.test";
    const otpHash = await bcrypt.hash("123456", 10);
    const save = vi.fn().mockResolvedValue(undefined);

    vi.mocked(User.findOne).mockResolvedValue({
      email,
      emailVerified: false,
      save,
    } as never);

    vi.mocked(EmailVerificationOtp.findOne).mockResolvedValue({
      otpHash,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    } as never);

    vi.mocked(EmailVerificationOtp.updateOne).mockResolvedValue({} as never);

    await expect(verifyEmailOtpCode(email, "000000")).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired code",
    });
    expect(EmailVerificationOtp.updateOne).toHaveBeenCalledWith({ email }, { $inc: { attempts: 1 } });
    expect(save).not.toHaveBeenCalled();
  });

  it("verifyEmailOtpCode marks user verified on correct OTP", async () => {
    const email = "user@example.test";
    const code = "654321";
    const otpHash = await bcrypt.hash(code, 10);
    const save = vi.fn().mockResolvedValue(undefined);

    vi.mocked(User.findOne).mockResolvedValue({
      email,
      emailVerified: false,
      save,
    } as never);

    vi.mocked(EmailVerificationOtp.findOne).mockResolvedValue({
      otpHash,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    } as never);

    vi.mocked(EmailVerificationOtp.deleteMany).mockResolvedValue({} as never);

    const result = await verifyEmailOtpCode(email, code);
    expect(result.user.emailVerified).toBe(true);
    expect(save).toHaveBeenCalled();
    expect(EmailVerificationOtp.deleteMany).toHaveBeenCalledWith({ email });
  });

  it("verifyEmailOtpCode blocks after max attempts", async () => {
    const email = "user@example.test";
    vi.mocked(User.findOne).mockResolvedValue({
      email,
      emailVerified: false,
    } as never);
    vi.mocked(EmailVerificationOtp.findOne).mockResolvedValue({
      otpHash: "hash",
      expiresAt: new Date(Date.now() + 60_000),
      attempts: OTP_MAX_ATTEMPTS,
    } as never);

    await expect(verifyEmailOtpCode(email, "123456")).rejects.toMatchObject({
      statusCode: 429,
    });
  });
});
