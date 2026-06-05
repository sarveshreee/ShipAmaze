import { afterEach, describe, expect, it } from "vitest";
import {
  brevoApiKeyHint,
  isLikelyBrevoV3ApiKey,
  resolveApiMail,
  resolveBrevoApi,
  resolveResendApi,
} from "./emailApiTransport.js";

describe("emailApiTransport", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("prefers Brevo when BREVO_API_KEY is set", () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.MAIL_FROM_EMAIL = "sender@gmail.com";
    expect(resolveApiMail()?.provider).toBe("brevo");
  });

  it("falls back to Resend when only RESEND_API_KEY is set", () => {
    delete process.env.BREVO_API_KEY;
    process.env.RESEND_API_KEY = "re_test";
    expect(resolveResendApi()?.provider).toBe("resend");
    expect(resolveApiMail()?.provider).toBe("resend");
  });

  it("detects invalid Brevo key formats", () => {
    expect(isLikelyBrevoV3ApiKey("xkeysib-abc123def456ghi789jkl012")).toBe(true);
    expect(brevoApiKeyHint("xsmtpsib-bad")).toContain("SMTP key");
    expect(brevoApiKeyHint("wrong-key")).toContain("xkeysib-");
  });

  it("returns null when no API keys configured", () => {
    delete process.env.BREVO_API_KEY;
    delete process.env.RESEND_API_KEY;
    expect(resolveBrevoApi()).toBeNull();
    expect(resolveApiMail()).toBeNull();
  });
});
